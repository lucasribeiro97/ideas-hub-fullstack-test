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
 * Parâmetros ausentes ou vazios são omitidos em vez de enviados em branco: a
 * API trata `search=` como ausência de filtro, mas enviar chaves vazias
 * poluiria a URL e faria o cache do TanStack Query tratar `?search=` e
 * `?` como consultas diferentes, buscando duas vezes o mesmo resultado.
 */
export function buildListQuery(params: ListUsersParams): string {
  const query = new URLSearchParams()

  if (params.search) query.set('search', params.search)
  if (params.page !== undefined && params.page > 1) query.set('page', String(params.page))
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
