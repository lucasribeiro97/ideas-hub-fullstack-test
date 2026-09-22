import { setupServer } from 'msw/node'

/**
 * API simulada para os testes do frontend.
 *
 * As respostas usam exatamente os campos que os testes de integração da API
 * verificam — é o que impede os tipos duplicados em `src/api/types.ts` de
 * divergirem do contrato real sem ninguém notar.
 */
export const apiServer = setupServer()

export const API_URL = 'http://localhost:3000'

export function buildUser(overrides: Partial<import('../../src/api/types.js').User> = {}) {
  return {
    id: '63f1ea59-25ad-41ab-8437-b8c00bed9031',
    name: 'Ana Souza',
    email: 'ana@exemplo.com',
    phone: null,
    createdAt: '2026-09-22T12:00:00.000Z',
    updatedAt: '2026-09-22T12:00:00.000Z',
    ...overrides,
  }
}

export function buildUserList(users = [buildUser()], meta = {}) {
  return {
    data: users,
    meta: { page: 1, perPage: 20, total: users.length, totalPages: 1, ...meta },
  }
}
