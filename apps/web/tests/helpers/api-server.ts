import { setupServer } from 'msw/node'
import { afterEach } from 'vitest'

/**
 * API simulada para os testes do frontend.
 *
 * As respostas usam exatamente os campos que os testes de integração da API
 * verificam — é o que impede os tipos duplicados em `src/api/types.ts` de
 * divergirem do contrato real sem ninguém notar.
 */
export const apiServer = setupServer()

export const API_URL = 'http://localhost:3000'

/**
 * Registra as requisições que a tela dispara, para que um teste possa afirmar
 * sobre o caminho e não só sobre o resultado.
 *
 * Existe por causa de dois defeitos que passaram por toda a suíte: uma exclusão
 * que buscava o registro recém-apagado e recebia 404, e uma edição que buscava
 * duas vezes o dado que a própria resposta já trazia. Nos dois casos o que a
 * tela mostrava no fim estava correto — a asserção sobre a tela não tinha como
 * pegar o problema, porque o problema estava no meio do caminho.
 *
 * Chamar a função devolve a lista, que é preenchida enquanto o teste corre.
 */
export function recordRequests(): { method: string; path: string }[] {
  const recorded: { method: string; path: string }[] = []

  const listener = ({ request }: { request: Request }) => {
    const url = new URL(request.url)

    if (url.origin !== API_URL) return

    recorded.push({ method: request.method, path: `${url.pathname}${url.search}` })
  }

  apiServer.events.on('request:start', listener)
  // Sem a remoção, o ouvinte sobrevive ao teste e passa a registrar as
  // requisições dos casos seguintes na lista de um caso já encerrado.
  afterEach(() => {
    apiServer.events.removeListener('request:start', listener)
  })

  return recorded
}

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
