import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { http, HttpResponse, delay } from 'msw'
import { ApiError, request } from '../src/api/client'
import { buildListQuery, createUser, deleteUser, getUser, listUsers, updateUser } from '../src/api/users'
import { getWeather } from '../src/api/weather'
import { API_URL, apiServer, buildUser, buildUserList } from './helpers/api-server'

beforeAll(() => {
  // Qualquer requisição a endereço não simulado falha o teste, em vez de
  // escapar para a rede de verdade.
  apiServer.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  apiServer.resetHandlers()
})

afterAll(() => {
  apiServer.close()
})

describe('buildListQuery', () => {
  it('não gera query quando não há parâmetros', () => {
    expect(buildListQuery({})).toBe('')
  })

  // Enviar chaves vazias faria o cache do TanStack Query tratar `?search=` e
  // `?` como consultas diferentes, buscando duas vezes o mesmo resultado.
  it('omite busca vazia em vez de enviá-la em branco', () => {
    expect(buildListQuery({ search: '' })).toBe('')
  })

  it('omite a página 1, que é o padrão', () => {
    expect(buildListQuery({ page: 1 })).toBe('')
    expect(buildListQuery({ page: 2 })).toBe('?page=2')
  })

  it('inclui os parâmetros informados', () => {
    const query = buildListQuery({ search: 'souza', perPage: 10, sort: 'name', order: 'asc' })

    expect(query).toContain('search=souza')
    expect(query).toContain('perPage=10')
    expect(query).toContain('sort=name')
    expect(query).toContain('order=asc')
  })

  it('codifica caracteres especiais da busca', () => {
    expect(buildListQuery({ search: 'ana & bruno' })).toContain('ana+%26+bruno')
  })
})

describe('listUsers', () => {
  it('devolve dados e metadados', async () => {
    apiServer.use(http.get(`${API_URL}/users`, () => HttpResponse.json(buildUserList())))

    const result = await listUsers({})

    expect(result.data).toHaveLength(1)
    expect(result.meta.total).toBe(1)
  })

  it('envia os filtros na query', async () => {
    let capturedQuery = ''
    apiServer.use(
      http.get(`${API_URL}/users`, ({ request: req }) => {
        capturedQuery = new URL(req.url).search

        return HttpResponse.json(buildUserList())
      }),
    )

    await listUsers({ search: 'souza', page: 3 })

    expect(capturedQuery).toContain('search=souza')
    expect(capturedQuery).toContain('page=3')
  })
})

describe('operações de escrita', () => {
  it('createUser envia POST com o corpo em JSON', async () => {
    let body: unknown
    apiServer.use(
      http.post(`${API_URL}/users`, async ({ request: req }) => {
        body = await req.json()

        return HttpResponse.json(buildUser(), { status: 201 })
      }),
    )

    await createUser({ name: 'Ana Souza', email: 'ana@exemplo.com' })

    expect(body).toEqual({ name: 'Ana Souza', email: 'ana@exemplo.com' })
  })

  it('updateUser envia PATCH apenas com os campos informados', async () => {
    let body: unknown
    apiServer.use(
      http.patch(`${API_URL}/users/:id`, async ({ request: req }) => {
        body = await req.json()

        return HttpResponse.json(buildUser({ name: 'Ana S.' }))
      }),
    )

    await updateUser('63f1ea59-25ad-41ab-8437-b8c00bed9031', { name: 'Ana S.' })

    expect(body).toEqual({ name: 'Ana S.' })
  })

  // 204 não tem corpo; tentar interpretá-lo como JSON lançaria erro.
  it('deleteUser lida com a resposta 204 sem corpo', async () => {
    apiServer.use(http.delete(`${API_URL}/users/:id`, () => new HttpResponse(null, { status: 204 })))

    await expect(deleteUser('63f1ea59-25ad-41ab-8437-b8c00bed9031')).resolves.toBeUndefined()
  })

  it('getUser busca pelo identificador', async () => {
    apiServer.use(http.get(`${API_URL}/users/:id`, () => HttpResponse.json(buildUser())))

    const user = await getUser('63f1ea59-25ad-41ab-8437-b8c00bed9031')

    expect(user.email).toBe('ana@exemplo.com')
  })
})

/*
 * O `code` do contrato é o que as telas consultam para decidir o que mostrar.
 * Comparar strings de mensagem seria frágil e quebraria ao ajustar um texto.
 */
describe('tradução de erros da API', () => {
  it('preserva código, mensagem e status', async () => {
    apiServer.use(
      http.post(`${API_URL}/users`, () =>
        HttpResponse.json(
          { error: { code: 'USER_EMAIL_TAKEN', message: 'Já existe um usuário com este email.' } },
          { status: 409 },
        ),
      ),
    )

    const error = (await createUser({ name: 'Ana', email: 'ana@exemplo.com' }).catch(
      (e: unknown) => e,
    )) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('USER_EMAIL_TAKEN')
    expect(error.status).toBe(409)
    expect(error.message).toBe('Já existe um usuário com este email.')
  })

  it('expõe o detalhe por campo, para o formulário marcar o campo certo', async () => {
    apiServer.use(
      http.post(`${API_URL}/users`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Dados inválidos.',
              details: [
                { field: 'email', message: 'email inválido' },
                { field: 'name', message: 'nome é obrigatório' },
              ],
            },
          },
          { status: 422 },
        ),
      ),
    )

    const error = (await createUser({ name: '', email: 'x' }).catch((e: unknown) => e)) as ApiError

    expect(error.messageForField('email')).toBe('email inválido')
    expect(error.messageForField('name')).toBe('nome é obrigatório')
    expect(error.messageForField('phone')).toBeUndefined()
  })

  it('usa código genérico quando a resposta não segue o envelope', async () => {
    // Um proxy mal configurado pode devolver HTML num 502; o corpo é inútil e
    // o que resta de informação é o status.
    apiServer.use(
      http.get(`${API_URL}/users`, () => new HttpResponse('<html>bad gateway</html>', { status: 502 })),
    )

    const error = (await listUsers({}).catch((e: unknown) => e)) as ApiError

    expect(error.code).toBe('UNKNOWN_ERROR')
    expect(error.status).toBe(502)
  })

  it('falha de rede vira NETWORK_ERROR com mensagem compreensível', async () => {
    apiServer.use(http.get(`${API_URL}/users`, () => HttpResponse.error()))

    const error = (await listUsers({}).catch((e: unknown) => e)) as ApiError

    expect(error.code).toBe('NETWORK_ERROR')
    expect(error.message).toContain('servidor')
  })
})

/*
 * Cancelamento precisa continuar sendo um AbortError para que o TanStack Query
 * o reconheça. Convertê-lo em ApiError faria uma busca superada exibir
 * mensagem de erro na tela (critério S12).
 */
describe('cancelamento de requisições', () => {
  it('propaga o AbortError sem convertê-lo em erro da API', async () => {
    apiServer.use(
      http.get(`${API_URL}/users`, async () => {
        await delay(500)

        return HttpResponse.json(buildUserList())
      }),
    )

    const controller = new AbortController()
    const promise = listUsers({}, { signal: controller.signal })
    controller.abort()

    const error = (await promise.catch((e: unknown) => e)) as Error

    expect(error.name).toBe('AbortError')
    expect(error).not.toBeInstanceOf(ApiError)
  })
})

describe('clima', () => {
  it('codifica o nome da cidade', async () => {
    let path = ''
    apiServer.use(
      http.get(`${API_URL}/weather/:city`, ({ request: req }) => {
        path = new URL(req.url).pathname

        return HttpResponse.json({ city: 'São Paulo' })
      }),
    )

    await getWeather('São Paulo')

    expect(path).toContain('S%C3%A3o%20Paulo')
  })
})

describe('request', () => {
  it('não envia Content-Type quando não há corpo', async () => {
    let hasContentType = true
    apiServer.use(
      http.get(`${API_URL}/users`, ({ request: req }) => {
        hasContentType = req.headers.has('content-type')

        return HttpResponse.json(buildUserList())
      }),
    )

    await request('/users')

    expect(hasContentType).toBe(false)
  })
})
