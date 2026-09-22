export interface CacheEntry<T> {
  value: T
  fetchedAt: number
}

export interface LookupResult<T> {
  entry: CacheEntry<T>
  expired: boolean
}

export interface TtlCacheOptions {
  ttlMs: number
  /** Número máximo de chaves. Ver comentário sobre crescimento ilimitado. */
  maxEntries?: number
  /** Relógio injetável: os testes avançam o tempo sem esperar de verdade. */
  now?: () => number
}

export interface TtlCache<T> {
  lookup: (key: string) => LookupResult<T> | undefined
  set: (key: string, value: T) => CacheEntry<T>
  size: () => number
  clear: () => void
}

const DEFAULT_MAX_ENTRIES = 500

/**
 * Cache em memória com expiração por entrada.
 *
 * `lookup` devolve a entrada mesmo expirada, sinalizando `expired`. Isso é o
 * que viabiliza a política `stale-if-error`: quem chama decide entre usar o
 * dado velho ou propagar a falha, em vez de o cache apagar a única cópia que
 * restava justamente quando a origem está fora do ar.
 *
 * O limite de entradas não é enfeite: a chave vem do nome de cidade informado
 * na URL, ou seja, é controlada por quem chama. Sem teto, requisições com
 * nomes aleatórios fariam o mapa crescer até consumir a memória do processo.
 * A remoção é da chave inserida há mais tempo — o `Map` do JavaScript preserva
 * a ordem de inserção, então a primeira chave iterada é a mais antiga.
 */
export function createTtlCache<T>(options: TtlCacheOptions): TtlCache<T> {
  const entries = new Map<string, CacheEntry<T>>()
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const now = options.now ?? (() => Date.now())

  return {
    lookup(key) {
      const entry = entries.get(key)
      if (!entry) return undefined

      return { entry, expired: now() - entry.fetchedAt >= options.ttlMs }
    },

    set(key, value) {
      const entry: CacheEntry<T> = { value, fetchedAt: now() }

      // Reinserir move a chave para o fim da ordem de iteração, o que mantém
      // as cidades consultadas com frequência longe da remoção.
      entries.delete(key)
      entries.set(key, entry)

      if (entries.size > maxEntries) {
        const excess = [...entries.keys()].slice(0, entries.size - maxEntries)
        for (const staleKey of excess) entries.delete(staleKey)
      }

      // Devolver a entrada evita um `lookup` logo em seguida só para descobrir
      // o horário — e o fallback impossível que esse lookup exigiria.
      return entry
    },

    size: () => entries.size,
    clear: () => entries.clear(),
  }
}

/**
 * Normaliza o nome da cidade usado como chave.
 *
 * Apenas caixa e espaços: acentos são preservados de propósito. "Sao Paulo" e
 * "São Paulo" são consultas diferentes para a origem e podem devolver
 * localidades diferentes — uni-las esconderia esse comportamento e serviria a
 * resposta de uma cidade para a busca de outra.
 */
export function cacheKeyForCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, ' ')
}
