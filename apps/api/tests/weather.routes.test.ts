import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/lib/env.js'
import { connectTestDatabase } from './helpers/database.js'
import {
  WEATHER_BASE_URL,
  mockCityNotFound,
  mockInvalidKey,
  mockMalformedPayload,
  mockNetworkFailure,
  mockRateLimited,
  mockServerError,
  mockSlowResponse,
  mockSuccess,
  weatherApi,
} from './helpers/weather-api.js'

const { db, pool } = connectTestDatabase()

/** Valor reconhecível: se aparecer em alguma resposta ou log, vazou. */
const API_KEY = 'CHAVE-SECRETA-QUE-NAO-PODE-VAZAR-123'

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://ignorado-nos-testes',
  WEATHER_API_KEY: API_KEY,
  WEATHER_API_BASE_URL: WEATHER_BASE_URL,
  WEATHER_TIMEOUT_MS: '300',
  // TTL de 1 segundo: cada teste usa uma cidade distinta, e o cache curto
  // impede que o resultado de um caso contamine o seguinte.
  WEATHER_CACHE_TTL_SECONDS: '1',
})

let app: FastifyInstance

beforeAll(async () => {
  weatherApi.listen({ onUnhandledRequest: 'error' })
  app = await buildApp(env, { db })
  await app.ready()
})

beforeEach(() => {
  weatherApi.resetHandlers()
})

afterEach(() => {
  weatherApi.resetHandlers()
})

afterAll(async () => {
  weatherApi.close()
  await app.close()
  await pool.end()
})

interface ErrorBody {
  error: { code: string; message: string }
}

/** Cidade única por caso, para que o cache não interfira entre testes. */
let cityCounter = 0
function uniqueCity(): string {
  cityCounter += 1

  return `Cidade Teste ${cityCounter}`
}

function get(city: string): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'GET', url: `/weather/${encodeURIComponent(city)}` })
}

describe('GET /weather/:city — sucesso', () => {
  it('responde 200 com o contrato próprio', async () => {
    mockSuccess({ city: 'São Paulo', tempC: 24.1 })

    const response = await get(uniqueCity())
    const body = response.json<{
      city: string
      current: { temperatureC: number; humidity: number; condition: string }
      hourly: { time: string; temperatureC: number }[]
      cache: { hit: boolean; stale: boolean; fetchedAt: string }
    }>()

    expect(response.statusCode).toBe(200)
    expect(body.current.temperatureC).toBe(24.1)
    expect(body.current.humidity).toBe(65)
    expect(body.current.condition).toBe('Parcialmente nublado')
    expect(body.hourly).toHaveLength(24)
    expect(body.cache).toMatchObject({ hit: false, stale: false })
  })

  it('a série horária tem o formato que o gráfico consome', async () => {
    mockSuccess()

    const body = (await get(uniqueCity())).json<{
      hourly: { time: string; temperatureC: number }[]
    }>()

    expect(body.hourly[0]).toEqual({ time: '2026-09-22 00:00', temperatureC: 18 })
    expect(body.hourly.every((point) => typeof point.temperatureC === 'number')).toBe(true)
  })

  it('rejeita cidade vazia com 400', async () => {
    const response = await app.inject({ method: 'GET', url: '/weather/%20%20' })

    expect(response.statusCode).toBe(400)
    expect(response.json<ErrorBody>().error.code).toBe('INVALID_PARAM')
  })
})

/*
 * O mapeamento completo exigido pela SPEC §6, verificado no status HTTP que
 * chega a quem consome — e não apenas na classe de erro interna.
 */
describe('GET /weather/:city — os quatro modos de falha', () => {
  it('cidade inexistente responde 404', async () => {
    mockCityNotFound()

    const response = await get(uniqueCity())

    expect(response.statusCode).toBe(404)
    expect(response.json<ErrorBody>().error.code).toBe('WEATHER_CITY_NOT_FOUND')
  })

  it('timeout da origem responde 504', async () => {
    mockSlowResponse(2_000)

    const response = await get(uniqueCity())

    expect(response.statusCode).toBe(504)
    expect(response.json<ErrorBody>().error.code).toBe('WEATHER_TIMEOUT')
  })

  it('limite de cota responde 429', async () => {
    mockRateLimited()

    const response = await get(uniqueCity())

    expect(response.statusCode).toBe(429)
    expect(response.json<ErrorBody>().error.code).toBe('WEATHER_RATE_LIMITED')
  })

  it('indisponibilidade responde 502', async () => {
    mockServerError(503)

    const response = await get(uniqueCity())

    expect(response.statusCode).toBe(502)
    expect(response.json<ErrorBody>().error.code).toBe('WEATHER_UPSTREAM_ERROR')
  })

  it('falha de rede responde 502', async () => {
    mockNetworkFailure()

    expect((await get(uniqueCity())).statusCode).toBe(502)
  })

  it('resposta fora do formato esperado responde 502', async () => {
    mockMalformedPayload()

    expect((await get(uniqueCity())).statusCode).toBe(502)
  })

  // Chave inválida é problema nosso de configuração. Responder 403 ao cliente
  // sugeriria que ele não tem permissão para consultar o clima.
  it('chave inválida responde 502, e não 403', async () => {
    mockInvalidKey()

    const response = await get(uniqueCity())

    expect(response.statusCode).toBe(502)
    expect(response.statusCode).not.toBe(403)
  })

  it('nenhuma resposta de erro expõe a forma da origem', async () => {
    mockCityNotFound()

    const body = (await get(uniqueCity())).body

    expect(body).not.toContain('No matching location')
    expect(body).not.toContain('1006')
    expect(body).not.toContain('weatherapi')
  })
})

/*
 * Critério S8. A chave é o único segredo do projeto, e o enunciado exige que
 * ela não chegue ao navegador. Estes testes usam um valor reconhecível e
 * procuram por ele em toda a superfície visível ao cliente.
 */
describe('a chave da API nunca alcança o cliente', () => {
  it('não aparece na resposta de sucesso', async () => {
    mockSuccess()

    const response = await get(uniqueCity())

    expect(response.body).not.toContain(API_KEY)
    expect(JSON.stringify(response.headers)).not.toContain(API_KEY)
  })

  it.each([
    ['cidade inexistente', mockCityNotFound],
    ['limite de cota', mockRateLimited],
    ['indisponibilidade', mockServerError],
    ['chave inválida', mockInvalidKey],
    ['formato inesperado', mockMalformedPayload],
  ])('não aparece na resposta de erro por %s', async (_case, applyMock) => {
    applyMock()

    const response = await get(uniqueCity())

    expect(response.body).not.toContain(API_KEY)
    expect(JSON.stringify(response.headers)).not.toContain(API_KEY)
  })

  it('a rota não revela a URL da origem externa', async () => {
    mockSuccess()

    const response = await get(uniqueCity())

    expect(response.body).not.toContain('api.weatherapi.com')
    expect(response.body).not.toContain('forecast.json')
  })
})

describe('GET /weather/:city — cache através da rota', () => {
  it('a segunda consulta à mesma cidade vem do cache', async () => {
    mockSuccess()
    const city = uniqueCity()

    const first = (await get(city)).json<{ cache: { hit: boolean } }>()
    const second = (await get(city)).json<{ cache: { hit: boolean } }>()

    expect(first.cache.hit).toBe(false)
    expect(second.cache.hit).toBe(true)
  })

  it('serve dado expirado com stale: true quando a origem cai', async () => {
    mockSuccess({ tempC: 19.5 })
    const city = uniqueCity()
    await get(city)

    // Espera o TTL de 1 segundo expirar.
    await new Promise((resolve) => setTimeout(resolve, 1_100))
    mockServerError(503)

    const response = await get(city)
    const body = response.json<{ current: { temperatureC: number }; cache: { stale: boolean } }>()

    expect(response.statusCode).toBe(200)
    expect(body.current.temperatureC).toBe(19.5)
    expect(body.cache.stale).toBe(true)
  })
})
