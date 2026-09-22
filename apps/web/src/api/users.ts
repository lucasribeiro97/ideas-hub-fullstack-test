import { request, type RequestOptions } from './client.js'
import type {
  CreateUserInput,
  ListUsersParams,
  UpdateUserInput,
  User,
  UserList,
} from './types.js'

/**
 * Monta a query da listagem.
 *
 * Serialização mecânica: envia o que recebe, sem conhecer os valores padrão
 * da API. Quem decide o que aparece na barra de endereços é `toSearchParams`,
 * em `lib/userFilters.ts` — são responsabilidades diferentes, e misturá-las
 * criaria duas regras de omissão discordando entre si.
 *
 * A única exceção é a busca vazia, omitida porque a API trata `search=` como
 * ausência de filtro e enviar a chave em branco só polui a requisição.
 */
export function buildListQuery(params: ListUsersParams): string {
  const query = new URLSearchParams()

  if (params.search) query.set('search', params.search)
  if (params.page !== undefined) query.set('page', String(params.page))
  if (params.perPage !== undefined) query.set('perPage', String(params.perPage))
  if (params.sort !== undefined) query.set('sort', params.sort)
  if (params.order !== undefined) query.set('order', params.order)

  const serialized = query.toString()

  return serialized.length > 0 ? `?${serialized}` : ''
}

export function listUsers(params: ListUsersParams, options?: RequestOptions): Promise<UserList> {
  return request<UserList>(`/users${buildListQuery(params)}`, options)
}

export function getUser(id: string, options?: RequestOptions): Promise<User> {
  return request<User>(`/users/${id}`, options)
}

export function createUser(input: CreateUserInput): Promise<User> {
  return request<User>('/users', { method: 'POST', body: input })
}

export function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  return request<User>(`/users/${id}`, { method: 'PATCH', body: input })
}

export function deleteUser(id: string): Promise<void> {
  return request<void>(`/users/${id}`, { method: 'DELETE' })
}
