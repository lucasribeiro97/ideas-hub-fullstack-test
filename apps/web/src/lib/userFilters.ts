import { SORT_FIELDS, SORT_ORDERS, type SortField, type SortOrder } from '../api/types.ts'

export interface UsersFilters {
  search: string
  page: number
  perPage: number
  sort: SortField
  order: SortOrder
}

/** Iguais aos padrões da API (SPEC §6), para que a primeira carga não precise
 *  enviar parâmetro algum. */
export const DEFAULT_FILTERS: UsersFilters = {
  search: '',
  page: 1,
  perPage: 20,
  sort: 'createdAt',
  order: 'desc',
}

export const PER_PAGE_OPTIONS = [10, 20, 50, 100] as const

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function parseOneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/**
 * Só as opções oferecidas na interface são aceitas.
 *
 * A API limita `perPage` a 100, mas um valor arbitrário como 37 deixaria o
 * seletor da tela sem nenhuma opção correspondente selecionada.
 */
function parsePerPage(value: string | null): number {
  const parsed = parsePositiveInt(value, DEFAULT_FILTERS.perPage)
  const isOffered = (PER_PAGE_OPTIONS as readonly number[]).includes(parsed)

  return isOffered ? parsed : DEFAULT_FILTERS.perPage
}

/**
 * Lê os filtros da URL.
 *
 * Valores inválidos caem no padrão em vez de propagar para a API: a URL é
 * editável por quem usa, e `?page=abc` não pode virar uma requisição com
 * `page=NaN` nem uma tela de erro. O pior caso é ver a primeira página.
 */
export function parseFilters(params: URLSearchParams): UsersFilters {
  return {
    search: params.get('search')?.trim() ?? DEFAULT_FILTERS.search,
    page: parsePositiveInt(params.get('page'), DEFAULT_FILTERS.page),
    perPage: parsePerPage(params.get('perPage')),
    sort: parseOneOf(params.get('sort'), SORT_FIELDS, DEFAULT_FILTERS.sort),
    order: parseOneOf(params.get('order'), SORT_ORDERS, DEFAULT_FILTERS.order),
  }
}

/**
 * Converte os filtros de volta para a URL, omitindo o que está no padrão.
 *
 * Uma URL limpa é compartilhável e legível: `/users?search=souza` diz o que
 * faz, enquanto `/users?search=souza&page=1&perPage=20&sort=createdAt&order=desc`
 * esconde a informação útil no meio do ruído.
 */
export function toSearchParams(filters: UsersFilters): URLSearchParams {
  const params = new URLSearchParams()

  if (filters.search !== DEFAULT_FILTERS.search) params.set('search', filters.search)
  if (filters.page !== DEFAULT_FILTERS.page) params.set('page', String(filters.page))
  if (filters.perPage !== DEFAULT_FILTERS.perPage) params.set('perPage', String(filters.perPage))
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set('sort', filters.sort)
  if (filters.order !== DEFAULT_FILTERS.order) params.set('order', filters.order)

  return params
}

/** Mudanças que alteram o conjunto de resultados invalidam a página atual. */
const RESETS_PAGE: (keyof UsersFilters)[] = ['search', 'perPage', 'sort', 'order']

/**
 * Aplica uma alteração parcial aos filtros.
 *
 * Voltar para a página 1 ao mudar busca, ordenação ou itens por página não é
 * detalhe: sem isso, quem está na página 47 e digita uma busca com 3 páginas
 * de resultado vê uma lista vazia e conclui que a busca não encontrou nada.
 */
export function applyFilterChange(
  current: UsersFilters,
  change: Partial<UsersFilters>,
): UsersFilters {
  const shouldResetPage = RESETS_PAGE.some(
    (key) => change[key] !== undefined && change[key] !== current[key],
  )

  return {
    ...current,
    ...change,
    page: change.page ?? (shouldResetPage ? 1 : current.page),
  }
}

/**
 * Alterna a ordenação de uma coluna.
 *
 * Clicar numa coluna nova ordena de forma crescente — é o que se espera ao
 * ordenar por nome. Clicar na coluna já ativa inverte o sentido.
 */
export function toggleSort(current: UsersFilters, field: SortField): UsersFilters {
  const isSameField = current.sort === field

  return applyFilterChange(current, {
    sort: field,
    order: isSameField && current.order === 'asc' ? 'desc' : 'asc',
  })
}
