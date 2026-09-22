import { request, type RequestOptions } from './client.js'
import type { Weather } from './types.js'

/**
 * Consulta o clima de uma cidade.
 *
 * O nome vai codificado porque cidades brasileiras têm espaços e acentos —
 * "São Paulo" sem codificação quebraria a rota.
 */
export function getWeather(city: string, options?: RequestOptions): Promise<Weather> {
  return request<Weather>(`/weather/${encodeURIComponent(city)}`, options)
}
