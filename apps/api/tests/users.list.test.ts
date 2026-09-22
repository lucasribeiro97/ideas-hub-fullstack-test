import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/lib/env.js'
import { users } from '../src/db/schema.js'
import { clearUsers, connectTestDatabase } from './helpers/database.js'

const { db, pool } = connectTestDatabase()

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://ignorado-nos-testes',
  WEATHER_API_KEY: 'chave-de-teste',
})

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp(env, { db })
  await app.ready()
})

beforeEach(async () => {
  await clearUsers(db)
})

afterAll(async () => {
  await app.close()
  await pool.end()
})

interface ListBody {
  data: { id: string; name: string; email: string }[]
  meta: { page: number; perPage: number; total: number; totalPages: number }
}

interface ErrorBody {
  error: { code: string; details?: { field: string; message: string }[] }
}

async function list(querystring = ''): Promise<ListBody> {
  const response = await app.inject({ method: 'GET', url: `/users${querystring}` })

  return response.json<ListBody>()
}

async function seed(rows: { name: string; email: string; createdAt?: Date }[]): Promise<void> {
  await db.insert(users).values(rows)
}

describe('GET /users — listagem básica', () => {
  it('devolve lista vazia com meta coerente quando não há usuários', async () => {
    const body = await list()

    expect(body.data).toEqual([])
    expect(body.meta).toEqual({ page: 1, perPage: 20, total: 0, totalPages: 0 })
  })

  it('aplica os padrões documentados de page, perPage, sort e order', async () => {
    await seed([{ name: 'Ana', email: 'ana@exemplo.com' }])

    const body = await list()

    expect(body.meta.page).toBe(1)
    expect(body.meta.perPage).toBe(20)
    expect(body.meta.total).toBe(1)
  })
})

describe('GET /users — busca parcial', () => {
  beforeEach(async () => {
    await seed([
      { name: 'Ana Souza', email: 'ana.souza@exemplo.com' },
      { name: 'Bruno Lima', email: 'bruno@outrodominio.com' },
      { name: 'Carla Souza', email: 'carla@exemplo.com' },
    ])
  })

  it('casa trecho no meio do nome, não apenas o começo', async () => {
    const body = await list('?search=ouz')

    expect(body.data.map((u) => u.name).sort()).toEqual(['Ana Souza', 'Carla Souza'])
  })

  it('casa por email além de por nome', async () => {
    const body = await list('?search=outrodominio')

    expect(body.data).toHaveLength(1)
    expect(body.data[0]?.name).toBe('Bruno Lima')
  })

  it('ignora diferença de maiúsculas e minúsculas', async () => {
    const body = await list('?search=SOUZA')

    expect(body.data).toHaveLength(2)
  })

  it('reflete o filtro no total, não apenas nos itens da página', async () => {
    const body = await list('?search=Souza')

    expect(body.meta.total).toBe(2)
    expect(body.meta.totalPages).toBe(1)
  })

  it('devolve lista vazia quando nada casa', async () => {
    const body = await list('?search=zzzzzz')

    expect(body.data).toEqual([])
    expect(body.meta.total).toBe(0)
  })

  it('trata search vazio como ausência de filtro', async () => {
    const body = await list('?search=')

    expect(body.meta.total).toBe(3)
  })

  it('remove espaços em volta do termo', async () => {
    const body = await list('?search=%20%20Souza%20%20')

    expect(body.meta.total).toBe(2)
  })
})

/*
 * Curingas do LIKE tratados como texto literal. Uma implementação que
 * interpola o termo direto no padrão devolve resultado errado em silêncio:
 * "%" casaria com tudo e "_" com qualquer caractere — este último é comum em
 * endereços de email, então não é caso exótico.
 */
describe('GET /users — curingas na busca', () => {
  beforeEach(async () => {
    await seed([
      { name: 'Desconto 50% cliente', email: 'promo@exemplo.com' },
      { name: 'Ana Souza', email: 'ana_souza@exemplo.com' },
      { name: 'Ana Xsouza', email: 'anaxsouza@exemplo.com' },
    ])
  })

  it('busca por % encontra apenas quem tem % no texto', async () => {
    const body = await list('?search=%25')

    expect(body.meta.total).toBe(1)
    expect(body.data[0]?.name).toBe('Desconto 50% cliente')
  })

  it('busca por _ não funciona como curinga de um caractere', async () => {
    const body = await list('?search=ana_souza')

    expect(body.meta.total).toBe(1)
    expect(body.data[0]?.email).toBe('ana_souza@exemplo.com')
  })
})

describe('GET /users — ordenação', () => {
  beforeEach(async () => {
    await seed([
      { name: 'Carla', email: 'c@exemplo.com' },
      { name: 'Ana', email: 'a@exemplo.com' },
      { name: 'Bruno', email: 'b@exemplo.com' },
    ])
  })

  it('ordena por nome em ordem crescente', async () => {
    const body = await list('?sort=name&order=asc')

    expect(body.data.map((u) => u.name)).toEqual(['Ana', 'Bruno', 'Carla'])
  })

  it('ordena por nome em ordem decrescente', async () => {
    const body = await list('?sort=name&order=desc')

    expect(body.data.map((u) => u.name)).toEqual(['Carla', 'Bruno', 'Ana'])
  })

  it('ordena por email', async () => {
    const body = await list('?sort=email&order=asc')

    expect(body.data.map((u) => u.email)).toEqual([
      'a@exemplo.com',
      'b@exemplo.com',
      'c@exemplo.com',
    ])
  })

  it('rejeita campo de ordenação fora da lista permitida', async () => {
    const response = await app.inject({ method: 'GET', url: '/users?sort=senha' })

    expect(response.statusCode).toBe(400)
    expect(response.json<ErrorBody>().error.code).toBe('INVALID_PARAM')
  })

  it('rejeita direção de ordenação inválida', async () => {
    const response = await app.inject({ method: 'GET', url: '/users?order=aleatorio' })

    expect(response.statusCode).toBe(400)
  })
})

describe('GET /users — paginação', () => {
  beforeEach(async () => {
    await seed(
      Array.from({ length: 25 }, (_unused, index) => ({
        name: `Usuário ${String(index + 1).padStart(2, '0')}`,
        email: `usuario${String(index + 1).padStart(2, '0')}@exemplo.com`,
      })),
    )
  })

  it('devolve a quantidade pedida por página', async () => {
    const body = await list('?perPage=10')

    expect(body.data).toHaveLength(10)
    expect(body.meta).toMatchObject({ page: 1, perPage: 10, total: 25, totalPages: 3 })
  })

  it('a última página traz apenas o resto', async () => {
    const body = await list('?perPage=10&page=3')

    expect(body.data).toHaveLength(5)
    expect(body.meta.page).toBe(3)
  })

  it('página além do fim devolve lista vazia com meta coerente', async () => {
    const body = await list('?perPage=10&page=99')

    expect(body.data).toEqual([])
    expect(body.meta).toMatchObject({ page: 99, total: 25, totalPages: 3 })
  })

  // Sem desempate determinístico na ordenação, uma linha empatada pode
  // aparecer em duas páginas enquanto outra desaparece.
  it('não repete nem perde registros ao percorrer todas as páginas', async () => {
    const pages = await Promise.all([
      list('?perPage=10&page=1&sort=name&order=asc'),
      list('?perPage=10&page=2&sort=name&order=asc'),
      list('?perPage=10&page=3&sort=name&order=asc'),
    ])

    const ids = pages.flatMap((page) => page.data.map((u) => u.id))

    expect(ids).toHaveLength(25)
    expect(new Set(ids).size).toBe(25)
  })

  it('mantém a paginação estável quando o campo ordenado tem valores repetidos', async () => {
    await clearUsers(db)
    await seed(
      Array.from({ length: 10 }, (_unused, index) => ({
        name: 'Nome Repetido',
        email: `repetido${index}@exemplo.com`,
      })),
    )

    const firstPage = await list('?perPage=5&page=1&sort=name&order=asc')
    const secondPage = await list('?perPage=5&page=2&sort=name&order=asc')
    const ids = [...firstPage.data, ...secondPage.data].map((u) => u.id)

    expect(new Set(ids).size).toBe(10)
  })

  it('rejeita perPage acima do limite de 100', async () => {
    const response = await app.inject({ method: 'GET', url: '/users?perPage=101' })
    const body = response.json<ErrorBody>()

    expect(response.statusCode).toBe(400)
    expect(body.error.details?.[0]?.field).toBe('perPage')
  })

  it.each([
    ['page zero', '?page=0'],
    ['page negativa', '?page=-1'],
    ['page não numérica', '?page=abc'],
    ['perPage zero', '?perPage=0'],
  ])('rejeita %s', async (_case, querystring) => {
    const response = await app.inject({ method: 'GET', url: `/users${querystring}` })

    expect(response.statusCode).toBe(400)
  })
})

describe('GET /users — busca e paginação combinadas', () => {
  it('pagina dentro do resultado filtrado', async () => {
    await seed([
      ...Array.from({ length: 12 }, (_unused, index) => ({
        name: `Souza ${index}`,
        email: `souza${index}@exemplo.com`,
      })),
      ...Array.from({ length: 8 }, (_unused, index) => ({
        name: `Outro ${index}`,
        email: `outro${index}@exemplo.com`,
      })),
    ])

    const body = await list('?search=Souza&perPage=5&page=2')

    expect(body.meta.total).toBe(12)
    expect(body.meta.totalPages).toBe(3)
    expect(body.data).toHaveLength(5)
    expect(body.data.every((u) => u.name.includes('Souza'))).toBe(true)
  })
})
