import { http, HttpResponse } from 'msw'
import { API_URL, apiServer } from './api-server.ts'
import type { User } from '../../src/api/types.ts'

/**
 * Simulação da API de usuários com comportamento real.
 *
 * Diferente dos demais testes, que devolvem respostas fixas por caso, aqui o
 * filtro, a ordenação, a paginação e a unicidade de email são implementados de
 * fato, sobre um conjunto em memória.
 *
 * Isso importa para o teste de fluxo: buscar e depois paginar só exercita algo
 * se a busca realmente reduzir o conjunto e a paginação realmente recortá-lo.
 * Com respostas fixas, o teste passaria mesmo que a tela ignorasse os filtros.
 *
 * As regras seguem o contrato da SPEC §6, incluindo a unicidade de email sem
 * distinção de caixa.
 */

let users: User[] = []
let nextId = 1

function makeId(): string {
  const id = `00000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`
  nextId += 1

  return id
}

export function seedUsers(entries: { name: string; email: string; phone?: string | null }[]): void {
  users = entries.map((entry, index) => ({
    id: makeId(),
    name: entry.name,
    email: entry.email,
    phone: entry.phone ?? null,
    // Datas decrescentes, para que a ordenação padrão por createdAt produza a
    // mesma ordem em que os registros foram declarados.
    createdAt: new Date(Date.UTC(2026, 8, 22, 12, 0, 0) - index * 60_000).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 8, 22, 12, 0, 0) - index * 60_000).toISOString(),
  }))
}

export function currentUsers(): User[] {
  return users
}

function matches(user: User, search: string): boolean {
  const term = search.toLowerCase()

  return user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term)
}

function compare(a: User, b: User, sort: string, order: string): number {
  const field = sort === 'name' ? 'name' : sort === 'email' ? 'email' : 'createdAt'
  const result = a[field].localeCompare(b[field])

  return order === 'asc' ? result : -result
}

function emailTaken(email: string, exceptId?: string): boolean {
  return users.some(
    (user) => user.email.toLowerCase() === email.toLowerCase() && user.id !== exceptId,
  )
}

function conflict() {
  return HttpResponse.json(
    { error: { code: 'USER_EMAIL_TAKEN', message: 'Já existe um usuário com este email.' } },
    { status: 409 },
  )
}

function notFound() {
  return HttpResponse.json(
    { error: { code: 'USER_NOT_FOUND', message: 'Usuário não encontrado.' } },
    { status: 404 },
  )
}

export function installFakeApi(): void {
  apiServer.use(
    http.get(`${API_URL}/users`, ({ request }) => {
      const params = new URL(request.url).searchParams
      const search = params.get('search') ?? ''
      const page = Number(params.get('page') ?? '1')
      const perPage = Number(params.get('perPage') ?? '20')
      const sort = params.get('sort') ?? 'createdAt'
      const order = params.get('order') ?? 'desc'

      const filtered = search.length > 0 ? users.filter((user) => matches(user, search)) : users
      const sorted = [...filtered].sort((a, b) => compare(a, b, sort, order))
      const start = (page - 1) * perPage

      return HttpResponse.json({
        data: sorted.slice(start, start + perPage),
        meta: {
          page,
          perPage,
          total: filtered.length,
          totalPages: Math.ceil(filtered.length / perPage),
        },
      })
    }),

    http.get(`${API_URL}/users/:id`, ({ params }) => {
      const user = users.find((candidate) => candidate.id === params['id'])

      return user === undefined ? notFound() : HttpResponse.json(user)
    }),

    http.post(`${API_URL}/users`, async ({ request }) => {
      const body = (await request.json()) as { name: string; email: string; phone: string | null }

      if (emailTaken(body.email)) return conflict()

      const now = new Date().toISOString()
      const created: User = {
        id: makeId(),
        name: body.name,
        email: body.email,
        phone: body.phone,
        createdAt: now,
        updatedAt: now,
      }
      users = [created, ...users]

      return HttpResponse.json(created, { status: 201 })
    }),

    http.patch(`${API_URL}/users/:id`, async ({ params, request }) => {
      const index = users.findIndex((candidate) => candidate.id === params['id'])
      if (index === -1) return notFound()

      const body = (await request.json()) as Partial<{
        name: string
        email: string
        phone: string | null
      }>

      // Trocar para o próprio email não conflita — mesma regra da API.
      if (body.email !== undefined && emailTaken(body.email, params['id'] as string)) {
        return conflict()
      }

      const updated: User = {
        ...(users[index] as User),
        ...body,
        updatedAt: new Date().toISOString(),
      }
      users = users.map((user, position) => (position === index ? updated : user))

      return HttpResponse.json(updated)
    }),

    http.delete(`${API_URL}/users/:id`, ({ params }) => {
      const exists = users.some((candidate) => candidate.id === params['id'])
      if (!exists) return notFound()

      users = users.filter((candidate) => candidate.id !== params['id'])

      return new HttpResponse(null, { status: 204 })
    }),
  )
}
