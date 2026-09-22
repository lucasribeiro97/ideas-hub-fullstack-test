import { AppError } from '../../lib/errors.js'
import { fetchWeather, type WeatherClientOptions } from './weather.client.js'
import { cacheKeyForCity, type TtlCache } from './weather.cache.js'
import type { WeatherResponse, WeatherSnapshot } from './weather.schemas.js'

export interface WeatherServiceDependencies {
  client: WeatherClientOptions
  cache: TtlCache<WeatherSnapshot>
}

function withCacheMetadata(
  snapshot: WeatherSnapshot,
  meta: { hit: boolean; stale: boolean; fetchedAt: number },
): WeatherResponse {
  return {
    ...snapshot,
    cache: {
      hit: meta.hit,
      stale: meta.stale,
      fetchedAt: new Date(meta.fetchedAt).toISOString(),
    },
  }
}

/**
 * Consulta o clima com cache e proteção contra indisponibilidade.
 *
 * A política é `stale-if-error`: dentro do TTL, serve do cache; expirado,
 * busca na origem; se a origem falhar e ainda existir a entrada expirada,
 * devolve o dado antigo marcado com `stale: true` em vez de propagar o erro.
 *
 * Isso resolve dois requisitos do enunciado com a mesma peça — cache com
 * expiração e tratamento de indisponibilidade — e produz o comportamento que
 * quem usa a aplicação prefere: ver a temperatura de dez minutos atrás, com
 * aviso, em vez de uma tela de erro.
 *
 * O erro só é propagado quando não há absolutamente nada em mãos.
 */
export async function getWeather(
  deps: WeatherServiceDependencies,
  city: string,
): Promise<WeatherResponse> {
  const key = cacheKeyForCity(city)
  const cached = deps.cache.lookup(key)

  if (cached && !cached.expired) {
    return withCacheMetadata(cached.entry.value, {
      hit: true,
      stale: false,
      fetchedAt: cached.entry.fetchedAt,
    })
  }

  try {
    const snapshot = await fetchWeather(deps.client, city)
    const stored = deps.cache.set(key, snapshot)

    return withCacheMetadata(snapshot, {
      hit: false,
      stale: false,
      fetchedAt: stored.fetchedAt,
    })
  } catch (error) {
    // Só erros previstos da integração autorizam servir dado velho. Um defeito
    // nosso não deve ser mascarado por uma resposta aparentemente bem-sucedida.
    if (cached && error instanceof AppError) {
      return withCacheMetadata(cached.entry.value, {
        hit: true,
        stale: true,
        fetchedAt: cached.entry.fetchedAt,
      })
    }

    throw error
  }
}
