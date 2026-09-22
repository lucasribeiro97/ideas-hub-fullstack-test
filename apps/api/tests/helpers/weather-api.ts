import { http, HttpResponse, delay } from 'msw'
import { setupServer } from 'msw/node'

/**
 * Origem climática simulada.
 *
 * A WeatherAPI real nunca é chamada em teste: dependeria de rede, gastaria
 * cota e tornaria a suíte instável por motivo alheio ao código. Aqui os quatro
 * modos de falha exigidos pelo enunciado são provocados sob demanda.
 */
export const WEATHER_BASE_URL = 'https://api.weatherapi.com/v1'

export const FORECAST_URL = `${WEATHER_BASE_URL}/forecast.json`

/** Resposta de sucesso no formato real da WeatherAPI. */
export function forecastPayload(overrides: { city?: string; tempC?: number } = {}) {
  const city = overrides.city ?? 'São Paulo'
  const tempC = overrides.tempC ?? 24.1

  return {
    location: { name: city, region: 'Sao Paulo', country: 'Brazil', localtime: '2026-09-22 13:00' },
    current: {
      temp_c: tempC,
      feelslike_c: tempC + 1.2,
      humidity: 65,
      condition: { text: 'Parcialmente nublado', code: 1003 },
      last_updated: '2026-09-22 12:45',
      // Campo extra de propósito: a origem acrescentar dados não pode quebrar
      // a nossa validação.
      uv: 7,
    },
    forecast: {
      forecastday: [
        {
          date: '2026-09-22',
          hour: Array.from({ length: 24 }, (_unused, index) => ({
            time: `2026-09-22 ${String(index).padStart(2, '0')}:00`,
            temp_c: 18 + index * 0.3,
          })),
        },
      ],
    },
  }
}

export const weatherApi = setupServer()

/** Sucesso padrão. */
export function mockSuccess(overrides?: { city?: string; tempC?: number }): void {
  weatherApi.use(http.get(FORECAST_URL, () => HttpResponse.json(forecastPayload(overrides))))
}

/** Cidade inexistente: a WeatherAPI responde 400 com o código 1006. */
export function mockCityNotFound(): void {
  weatherApi.use(
    http.get(FORECAST_URL, () =>
      HttpResponse.json(
        { error: { code: 1006, message: 'No matching location found.' } },
        { status: 400 },
      ),
    ),
  )
}

/**
 * Cota esgotada, como a WeatherAPI de verdade responde.
 *
 * **HTTP 403**, não 429. A tabela oficial de erros
 * (https://www.weatherapi.com/docs/) mapeia o código 2007 — "API key has
 * exceeded calls per month quota" — para 403, e não tem nenhuma linha com 429.
 *
 * Este helper dizia 429, e o teste que o usava passava verificando uma resposta
 * que o fornecedor nunca envia: o simulador definia a realidade que ele mesmo
 * conferia. O defeito real só apareceu quando alguém foi ler a documentação da
 * origem.
 */
export function mockRateLimited(): void {
  weatherApi.use(
    http.get(FORECAST_URL, () =>
      HttpResponse.json(
        { error: { code: 2007, message: 'API key has exceeded calls per month quota.' } },
        { status: 403 },
      ),
    ),
  )
}

/**
 * Cota esgotada sinalizada por 429.
 *
 * A WeatherAPI não usa esse status hoje, mas ele é o convencional para o caso e
 * nada impede que passe a ser usado. O tratamento cobre os dois.
 */
export function mockRateLimitedByStatus(): void {
  weatherApi.use(
    http.get(FORECAST_URL, () => new HttpResponse(null, { status: 429 })),
  )
}

export function mockServerError(status = 503): void {
  weatherApi.use(http.get(FORECAST_URL, () => new HttpResponse(null, { status })))
}

/** Chave inválida: problema nosso de configuração, não de quem chamou. */
export function mockInvalidKey(): void {
  weatherApi.use(
    http.get(FORECAST_URL, () =>
      HttpResponse.json({ error: { code: 2008, message: 'API key disabled' } }, { status: 403 }),
    ),
  )
}

/** Demora maior que o timeout configurado nos testes. */
export function mockSlowResponse(ms = 5_000): void {
  weatherApi.use(
    http.get(FORECAST_URL, async () => {
      await delay(ms)

      return HttpResponse.json(forecastPayload())
    }),
  )
}

/** Resposta 200 fora do formato esperado — mudança de contrato da origem. */
export function mockMalformedPayload(): void {
  weatherApi.use(
    http.get(FORECAST_URL, () => HttpResponse.json({ location: { name: 'X' } })),
  )
}

/** 200 com corpo que não é JSON — proxy mal configurado devolvendo HTML. */
export function mockInvalidJson(): void {
  weatherApi.use(
    http.get(FORECAST_URL, () =>
      new HttpResponse('<html>gateway</html>', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
}

export function mockNetworkFailure(): void {
  weatherApi.use(http.get(FORECAST_URL, () => HttpResponse.error()))
}
