import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { fetchWeather } from '../src/modules/weather/weather.client.js'
import {
  WeatherCityNotFoundError,
  WeatherRateLimitedError,
  WeatherUpstreamError,
} from '../src/lib/errors.js'
import { FORECAST_URL, WEATHER_BASE_URL, weatherApi } from './helpers/weather-api.js'

/*
 * A classificação de falha da origem é feita pelo corpo, não pelo status.
 *
 * A WeatherAPI empacota vários significados no mesmo status HTTP: 403 cobre
 * cota esgotada (2007), chave desabilitada (2008) e falta de acesso ao recurso
 * (2009), que para nós são coisas diferentes — a primeira é limite de uso e
 * vira 429 para quem chamou, as outras são erro de configuração nosso e viram
 * 502 com registro no log.
 *
 * Estes casos existem porque o defeito anterior não era o código estar errado:
 * era o simulador dos testes descrever uma API que não existe. O helper
 * devolvia 429 para cota esgotada, status que a tabela oficial não usa em lugar
 * nenhum, e o teste passava conferindo a própria invenção.
 */

const OPTIONS = {
  baseUrl: WEATHER_BASE_URL,
  apiKey: 'chave-de-teste',
  timeoutMs: 2_000,
}

function respondWith(status: number, code?: number) {
  weatherApi.use(
    http.get(FORECAST_URL, () =>
      code === undefined
        ? new HttpResponse(null, { status })
        : HttpResponse.json({ error: { code, message: 'mensagem da origem' } }, { status }),
    ),
  )
}

beforeAll(() => {
  weatherApi.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  weatherApi.resetHandlers()
})

afterAll(() => {
  weatherApi.close()
})

describe('403 da WeatherAPI', () => {
  it('com código 2007 é cota esgotada, e não indisponibilidade', async () => {
    respondWith(403, 2007)

    await expect(fetchWeather(OPTIONS, 'Recife')).rejects.toBeInstanceOf(WeatherRateLimitedError)
  })

  it.each([
    ['2008, chave desabilitada', 2008],
    ['2009, chave sem acesso ao recurso', 2009],
  ])('com código %s é erro de configuração nosso', async (_rotulo, code) => {
    respondWith(403, code)

    // Vira 502 de propósito: quem chamou não tem o que corrigir, e o problema
    // precisa aparecer no log de quem opera.
    await expect(fetchWeather(OPTIONS, 'Recife')).rejects.toBeInstanceOf(WeatherUpstreamError)
  })

  it('sem corpo reconhecível cai no erro genérico', async () => {
    respondWith(403)

    await expect(fetchWeather(OPTIONS, 'Recife')).rejects.toBeInstanceOf(WeatherUpstreamError)
  })
})

describe('outros status', () => {
  it('429 continua sendo limite de uso, caso a origem passe a usá-lo', async () => {
    respondWith(429)

    await expect(fetchWeather(OPTIONS, 'Recife')).rejects.toBeInstanceOf(WeatherRateLimitedError)
  })

  it('400 com código 1006 continua sendo cidade inexistente', async () => {
    respondWith(400, 1006)

    await expect(fetchWeather(OPTIONS, 'zzzqqq')).rejects.toBeInstanceOf(WeatherCityNotFoundError)
  })

  it('400 com outro código não vira cidade inexistente', async () => {
    // Confundir os dois faria a interface dizer "cidade não encontrada" para um
    // problema que não tem nada a ver com a cidade digitada.
    respondWith(400, 1005)

    await expect(fetchWeather(OPTIONS, 'Recife')).rejects.toBeInstanceOf(WeatherUpstreamError)
  })

  it('401 é erro de configuração, não limite de uso', async () => {
    respondWith(401, 2006)

    await expect(fetchWeather(OPTIONS, 'Recife')).rejects.toBeInstanceOf(WeatherUpstreamError)
  })
})
