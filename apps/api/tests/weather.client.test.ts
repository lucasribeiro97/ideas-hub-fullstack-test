import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  WeatherCityNotFoundError,
  WeatherRateLimitedError,
  WeatherTimeoutError,
  WeatherUpstreamError,
} from '../src/lib/errors.js'
import { fetchWeather, type WeatherClientOptions } from '../src/modules/weather/weather.client.js'
import {
  WEATHER_BASE_URL,
  mockCityNotFound,
  mockInvalidJson,
  mockInvalidKey,
  mockMalformedPayload,
  mockNetworkFailure,
  mockRateLimited,
  mockServerError,
  mockSlowResponse,
  mockSuccess,
  weatherApi,
} from './helpers/weather-api.js'

const options: WeatherClientOptions = {
  baseUrl: WEATHER_BASE_URL,
  apiKey: 'chave-de-teste-nao-real',
  timeoutMs: 200,
}

beforeAll(() => {
  // `error` garante que qualquer requisição a um endereço não simulado falhe o
  // teste, em vez de escapar para a rede de verdade.
  weatherApi.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  weatherApi.resetHandlers()
})

afterAll(() => {
  weatherApi.close()
})

describe('fetchWeather — tradução para o contrato próprio', () => {
  it('converte a resposta da origem para o nosso formato', async () => {
    mockSuccess({ city: 'São Paulo', tempC: 24.1 })

    const snapshot = await fetchWeather(options, 'São Paulo')

    expect(snapshot.city).toBe('São Paulo')
    expect(snapshot.country).toBe('Brazil')
    expect(snapshot.current.temperatureC).toBe(24.1)
    expect(snapshot.current.humidity).toBe(65)
    expect(snapshot.current.condition).toBe('Parcialmente nublado')
  })

  it('não vaza nomes de campo da API externa', async () => {
    mockSuccess()

    const snapshot = await fetchWeather(options, 'São Paulo')
    const serialized = JSON.stringify(snapshot)

    expect(serialized).not.toContain('temp_c')
    expect(serialized).not.toContain('feelslike_c')
    expect(serialized).not.toContain('forecastday')
    expect(serialized).not.toContain('last_updated')
  })

  it('devolve a série horária do dia com 24 pontos', async () => {
    mockSuccess()

    const snapshot = await fetchWeather(options, 'São Paulo')

    expect(snapshot.hourly).toHaveLength(24)
    expect(snapshot.hourly[0]).toEqual({ time: '2026-09-22 00:00', temperatureC: 18 })
    expect(snapshot.hourly[23]?.temperatureC).toBeCloseTo(24.9, 1)
  })

  it('ignora campos extras da origem em vez de rejeitar a resposta', async () => {
    // O payload simulado inclui `uv`, que não consumimos. Uma validação
    // estrita demais quebraria a integração a cada campo novo que eles
    // acrescentassem.
    mockSuccess()

    await expect(fetchWeather(options, 'São Paulo')).resolves.toBeDefined()
  })

  it('a chave vai na requisição, mas não no resultado devolvido', async () => {
    let requestedUrl = ''
    weatherApi.events.on('request:start', ({ request }) => {
      requestedUrl = request.url
    })
    mockSuccess()

    const snapshot = await fetchWeather(options, 'São Paulo')

    expect(requestedUrl).toContain('key=chave-de-teste-nao-real')
    expect(JSON.stringify(snapshot)).not.toContain('chave-de-teste-nao-real')
    weatherApi.events.removeAllListeners()
  })
})

describe('fetchWeather — falhas da origem viram erros nossos', () => {
  it('cidade inexistente vira WeatherCityNotFoundError', async () => {
    mockCityNotFound()

    await expect(fetchWeather(options, 'Cidade Inventada')).rejects.toBeInstanceOf(
      WeatherCityNotFoundError,
    )
  })

  it('limite de cota vira WeatherRateLimitedError', async () => {
    mockRateLimited()

    await expect(fetchWeather(options, 'São Paulo')).rejects.toBeInstanceOf(
      WeatherRateLimitedError,
    )
  })

  it('indisponibilidade vira WeatherUpstreamError', async () => {
    mockServerError(503)

    await expect(fetchWeather(options, 'São Paulo')).rejects.toBeInstanceOf(WeatherUpstreamError)
  })

  it('demora acima do timeout vira WeatherTimeoutError', async () => {
    mockSlowResponse(1_000)

    await expect(fetchWeather(options, 'São Paulo')).rejects.toBeInstanceOf(WeatherTimeoutError)
  })

  it('falha de rede vira WeatherUpstreamError', async () => {
    mockNetworkFailure()

    await expect(fetchWeather(options, 'São Paulo')).rejects.toBeInstanceOf(WeatherUpstreamError)
  })

  // Chave errada é problema nosso de configuração, não de quem chamou a API.
  // Responder 403 ao cliente sugeriria que ele não tem permissão.
  it('chave inválida vira WeatherUpstreamError, não erro do cliente', async () => {
    mockInvalidKey()

    await expect(fetchWeather(options, 'São Paulo')).rejects.toBeInstanceOf(WeatherUpstreamError)
  })

  it('corpo 200 que não é JSON válido vira WeatherUpstreamError', async () => {
    mockInvalidJson()

    await expect(fetchWeather(options, 'São Paulo')).rejects.toBeInstanceOf(WeatherUpstreamError)
  })

  it('resposta 200 fora do formato esperado vira WeatherUpstreamError', async () => {
    mockMalformedPayload()

    await expect(fetchWeather(options, 'São Paulo')).rejects.toBeInstanceOf(WeatherUpstreamError)
  })

  it('nenhuma mensagem de erro expõe detalhe da origem', async () => {
    mockCityNotFound()

    let message = ''
    try {
      await fetchWeather(options, 'Inventada')
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).not.toContain('No matching location')
    expect(message).not.toContain('1006')
    expect(message).toBe('Cidade não encontrada.')
  })
})
