import {
  WeatherCityNotFoundError,
  WeatherRateLimitedError,
  WeatherTimeoutError,
  WeatherUpstreamError,
} from '../../lib/errors.js'
import {
  toWeatherSnapshot,
  weatherApiResponseSchema,
  type WeatherSnapshot,
} from './weather.schemas.js'

export interface WeatherClientOptions {
  baseUrl: string
  apiKey: string
  timeoutMs: number
}

/** Código da WeatherAPI para localidade não encontrada. */
const UPSTREAM_CODE_NO_LOCATION = 1006

interface UpstreamErrorBody {
  error?: { code?: number; message?: string }
}

/**
 * Converte a falha da origem em erro nosso.
 *
 * A regra é que nenhum status da WeatherAPI atravesse direto: o 400 que eles
 * usam para "cidade não existe" viraria um 400 genérico aqui, indistinguível
 * de erro de quem chamou. E 401/403 significam chave errada — problema nosso
 * de configuração, não do cliente, então vira 502 e vai para o log.
 */
async function translateUpstreamFailure(response: Response): Promise<never> {
  if (response.status === 429) throw new WeatherRateLimitedError()

  if (response.status === 400) {
    const body = (await response.json().catch(() => ({}))) as UpstreamErrorBody

    if (body.error?.code === UPSTREAM_CODE_NO_LOCATION) throw new WeatherCityNotFoundError()
  }

  throw new WeatherUpstreamError()
}

/**
 * Consulta a previsão do dia corrente.
 *
 * Uma chamada só devolve condição atual e série horária — motivo pelo qual a
 * WeatherAPI foi escolhida sobre a OpenWeather, cujo plano gratuito separa as
 * duas em endpoints distintos.
 */
export async function fetchWeather(
  options: WeatherClientOptions,
  city: string,
): Promise<WeatherSnapshot> {
  const url = new URL('forecast.json', `${options.baseUrl.replace(/\/$/, '')}/`)
  url.searchParams.set('key', options.apiKey)
  url.searchParams.set('q', city)
  url.searchParams.set('days', '1')
  url.searchParams.set('aqi', 'no')
  url.searchParams.set('alerts', 'no')
  url.searchParams.set('lang', 'pt')

  let response: Response

  try {
    // Timeout explícito: sem ele, uma origem lenta seguraria a requisição
    // até o limite do próprio Node, prendendo uma conexão do nosso servidor.
    response = await fetch(url, { signal: AbortSignal.timeout(options.timeoutMs) })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new WeatherTimeoutError()
    }

    // Falha de rede, DNS ou conexão recusada.
    throw new WeatherUpstreamError()
  }

  if (!response.ok) await translateUpstreamFailure(response)

  const payload: unknown = await response.json().catch(() => {
    throw new WeatherUpstreamError()
  })

  const parsed = weatherApiResponseSchema.safeParse(payload)

  // Resposta com 200 mas fora do formato esperado é mudança de contrato da
  // origem. Falhar aqui é melhor que propagar campos indefinidos até a tela.
  if (!parsed.success) throw new WeatherUpstreamError()

  return toWeatherSnapshot(parsed.data)
}
