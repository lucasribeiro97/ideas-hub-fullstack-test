import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { WeatherUpstreamError } from '../src/lib/errors.js'
import { cacheKeyForCity, createTtlCache } from '../src/modules/weather/weather.cache.js'
import { getWeather } from '../src/modules/weather/weather.service.js'
import type { WeatherSnapshot } from '../src/modules/weather/weather.schemas.js'
import {
  WEATHER_BASE_URL,
  mockCityNotFound,
  mockServerError,
  mockSuccess,
  weatherApi,
} from './helpers/weather-api.js'

const client = {
  baseUrl: WEATHER_BASE_URL,
  apiKey: 'chave-de-teste-nao-real',
  timeoutMs: 500,
}

/** Relógio controlado: os testes avançam o tempo sem esperar de verdade. */
let clock = 1_000_000

function now(): number {
  return clock
}

function advanceMinutes(minutes: number): void {
  clock += minutes * 60_000
}

let requestCount = 0

beforeAll(() => {
  weatherApi.listen({ onUnhandledRequest: 'error' })
  weatherApi.events.on('request:start', () => {
    requestCount += 1
  })
})

beforeEach(() => {
  clock = 1_000_000
  requestCount = 0
})

afterEach(() => {
  weatherApi.resetHandlers()
})

afterAll(() => {
  weatherApi.events.removeAllListeners()
  weatherApi.close()
})

function buildCache() {
  return createTtlCache<WeatherSnapshot>({ ttlMs: 10 * 60_000, now })
}

describe('cacheKeyForCity', () => {
  it('ignora caixa e espaços em volta', () => {
    expect(cacheKeyForCity('  São Paulo  ')).toBe('são paulo')
    expect(cacheKeyForCity('SÃO PAULO')).toBe('são paulo')
  })

  it('normaliza espaços internos repetidos', () => {
    expect(cacheKeyForCity('Rio   de    Janeiro')).toBe('rio de janeiro')
  })

  // Acentos preservados: são consultas diferentes para a origem e podem
  // devolver localidades diferentes.
  it('preserva acentos, tratando-os como cidades distintas', () => {
    expect(cacheKeyForCity('São Paulo')).not.toBe(cacheKeyForCity('Sao Paulo'))
  })
})

describe('cache com TTL', () => {
  it('a primeira consulta busca na origem e marca hit: false', async () => {
    mockSuccess()
    const cache = buildCache()

    const response = await getWeather({ client, cache }, 'São Paulo')

    expect(requestCount).toBe(1)
    expect(response.cache).toMatchObject({ hit: false, stale: false })
  })

  it('a segunda consulta dentro do TTL não chama a origem', async () => {
    mockSuccess()
    const cache = buildCache()

    await getWeather({ client, cache }, 'São Paulo')
    advanceMinutes(5)
    const response = await getWeather({ client, cache }, 'São Paulo')

    expect(requestCount).toBe(1)
    expect(response.cache).toMatchObject({ hit: true, stale: false })
  })

  it('após o TTL, busca na origem novamente', async () => {
    mockSuccess()
    const cache = buildCache()

    await getWeather({ client, cache }, 'São Paulo')
    advanceMinutes(11)
    const response = await getWeather({ client, cache }, 'São Paulo')

    expect(requestCount).toBe(2)
    expect(response.cache).toMatchObject({ hit: false, stale: false })
  })

  it('expira exatamente ao completar o TTL, não depois', async () => {
    mockSuccess()
    const cache = buildCache()

    await getWeather({ client, cache }, 'São Paulo')
    advanceMinutes(10)
    await getWeather({ client, cache }, 'São Paulo')

    expect(requestCount).toBe(2)
  })

  it('reaproveita a entrada mesmo com a cidade escrita de outra forma', async () => {
    mockSuccess()
    const cache = buildCache()

    await getWeather({ client, cache }, 'São Paulo')
    const response = await getWeather({ client, cache }, '  SÃO PAULO  ')

    expect(requestCount).toBe(1)
    expect(response.cache.hit).toBe(true)
  })

  it('mantém cidades diferentes em entradas separadas', async () => {
    mockSuccess()
    const cache = buildCache()

    await getWeather({ client, cache }, 'São Paulo')
    await getWeather({ client, cache }, 'Recife')

    expect(requestCount).toBe(2)
    expect(cache.size()).toBe(2)
  })

  it('informa quando o dado foi obtido', async () => {
    mockSuccess()
    const cache = buildCache()

    const response = await getWeather({ client, cache }, 'São Paulo')

    expect(new Date(response.cache.fetchedAt).getTime()).toBe(clock)
  })
})

/*
 * A política que resolve cache e indisponibilidade na mesma peça: com a origem
 * fora do ar, é melhor mostrar a temperatura de dez minutos atrás, avisando
 * que está desatualizada, do que uma tela de erro.
 */
describe('stale-if-error', () => {
  it('serve o dado expirado quando a origem fica indisponível', async () => {
    mockSuccess({ tempC: 24.1 })
    const cache = buildCache()
    await getWeather({ client, cache }, 'São Paulo')

    advanceMinutes(11)
    mockServerError(503)
    const response = await getWeather({ client, cache }, 'São Paulo')

    expect(response.current.temperatureC).toBe(24.1)
    expect(response.cache).toMatchObject({ hit: true, stale: true })
  })

  it('o dado servido como stale mantém o horário original da coleta', async () => {
    mockSuccess()
    const cache = buildCache()
    await getWeather({ client, cache }, 'São Paulo')
    const originalFetchTime = clock

    advanceMinutes(30)
    mockServerError(503)
    const response = await getWeather({ client, cache }, 'São Paulo')

    expect(new Date(response.cache.fetchedAt).getTime()).toBe(originalFetchTime)
  })

  it('propaga o erro quando não há nada em cache', async () => {
    mockServerError(503)
    const cache = buildCache()

    await expect(getWeather({ client, cache }, 'São Paulo')).rejects.toBeInstanceOf(
      WeatherUpstreamError,
    )
  })

  it('serve stale também quando a origem responde cidade inexistente', async () => {
    mockSuccess()
    const cache = buildCache()
    await getWeather({ client, cache }, 'São Paulo')

    advanceMinutes(11)
    mockCityNotFound()
    const response = await getWeather({ client, cache }, 'São Paulo')

    expect(response.cache.stale).toBe(true)
  })

  it('volta a servir dado fresco quando a origem se recupera', async () => {
    mockSuccess({ tempC: 20 })
    const cache = buildCache()
    await getWeather({ client, cache }, 'São Paulo')

    advanceMinutes(11)
    mockServerError(503)
    const whileDown = await getWeather({ client, cache }, 'São Paulo')
    expect(whileDown.cache.stale).toBe(true)

    mockSuccess({ tempC: 27 })
    const afterRecovery = await getWeather({ client, cache }, 'São Paulo')

    expect(afterRecovery.current.temperatureC).toBe(27)
    expect(afterRecovery.cache.stale).toBe(false)
  })
})

/*
 * A chave do cache vem do nome de cidade na URL, ou seja, é controlada por
 * quem chama. Sem teto, requisições com nomes aleatórios fariam o mapa crescer
 * até consumir a memória do processo.
 */
describe('relógio padrão', () => {
  it('usa Date.now quando nenhum relógio é injetado', () => {
    const cache = createTtlCache<string>({ ttlMs: 60_000 })
    const before = Date.now()

    const entry = cache.set('cidade', 'valor')

    expect(entry.fetchedAt).toBeGreaterThanOrEqual(before)
    expect(cache.lookup('cidade')?.expired).toBe(false)
  })
})

describe('limite de entradas', () => {
  it('não cresce além do máximo configurado', () => {
    const cache = createTtlCache<string>({ ttlMs: 60_000, maxEntries: 3, now })

    for (const city of ['a', 'b', 'c', 'd', 'e']) cache.set(city, city)

    expect(cache.size()).toBe(3)
  })

  it('remove a entrada inserida há mais tempo', () => {
    const cache = createTtlCache<string>({ ttlMs: 60_000, maxEntries: 2, now })

    cache.set('first', 'a')
    cache.set('second', 'b')
    cache.set('third', 'c')

    expect(cache.lookup('first')).toBeUndefined()
    expect(cache.lookup('second')).toBeDefined()
    expect(cache.lookup('third')).toBeDefined()
  })

  it('reinserir uma chave a protege da remoção', () => {
    const cache = createTtlCache<string>({ ttlMs: 60_000, maxEntries: 2, now })

    cache.set('old', 'a')
    cache.set('other', 'b')
    cache.set('old', 'a-updated')
    cache.set('new', 'c')

    expect(cache.lookup('old')).toBeDefined()
    expect(cache.lookup('other')).toBeUndefined()
  })
})
