/*
 * Tipos do contrato da API (SPEC §6).
 *
 * Declarados aqui e não importados do backend por decisão registrada na §4:
 * `apps/api` e `apps/web` são pacotes independentes, sem workspace. A
 * duplicação é o custo consciente dessa escolha — em troca, cada aplicação
 * instala e compila sozinha.
 *
 * O que impede a divergência silenciosa é o teste de contrato: as respostas
 * simuladas nos testes do frontend usam exatamente os mesmos campos que os
 * testes de integração da API verificam.
 */

export interface User {
  id: string
  name: string
  email: string
  phone: string | null
  createdAt: string
  updatedAt: string
}

export interface PaginationMeta {
  page: number
  perPage: number
  total: number
  totalPages: number
}

export interface UserList {
  data: User[]
  meta: PaginationMeta
}

export const SORT_FIELDS = ['name', 'email', 'createdAt'] as const
export type SortField = (typeof SORT_FIELDS)[number]

export const SORT_ORDERS = ['asc', 'desc'] as const
export type SortOrder = (typeof SORT_ORDERS)[number]

export interface ListUsersParams {
  search?: string
  page?: number
  perPage?: number
  sort?: SortField
  order?: SortOrder
}

export interface CreateUserInput {
  name: string
  email: string
  phone?: string | null
}

export type UpdateUserInput = Partial<CreateUserInput>

export interface ValidationDetail {
  field: string
  message: string
}

export interface HourlyTemperature {
  time: string
  temperatureC: number
}

export interface Weather {
  city: string
  region: string
  country: string
  current: {
    temperatureC: number
    feelsLikeC: number
    humidity: number
    condition: string
    observedAt: string
  }
  hourly: HourlyTemperature[]
  cache: {
    hit: boolean
    stale: boolean
    fetchedAt: string
  }
}
