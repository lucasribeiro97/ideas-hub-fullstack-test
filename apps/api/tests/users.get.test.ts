import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/lib/env.js'
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

interface ErrorBody {
  error: { code: string; message: string; details?: { field: string; message: string }[] }
}

async function createUser(payload: Record<string, unknown>): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/users', payload })

  return response.json<{ id: string }>().id
}

describe('GET /users/:id — encontrado', () => {
  it('responde 200 com o usuário completo', async () => {
    const id = await createUser({
      name: 'Ana Souza',
      email: 'Ana.Souza@Exemplo.com',
      phone: '(11) 91234-5678',
    })

    const response = await app.inject({ method: 'GET', url: `/users/${id}` })
    const body = response.json<{ id: string; name: string; email: string; phone: string }>()

    expect(response.statusCode).toBe(200)
    expect(body.id).toBe(id)
    expect(body.name).toBe('Ana Souza')
    expect(body.phone).toBe('(11) 91234-5678')
  })

  it('devolve o email com a caixa original preservada', async () => {
    const id = await createUser({ name: 'Bruno Lima', email: 'Bruno.Lima@Exemplo.com' })

    const response = await app.inject({ method: 'GET', url: `/users/${id}` })

    expect(response.json<{ email: string }>().email).toBe('Bruno.Lima@Exemplo.com')
  })

  it('devolve exatamente os campos do contrato', async () => {
    const id = await createUser({ name: 'Carla Dias', email: 'carla@exemplo.com' })

    const response = await app.inject({ method: 'GET', url: `/users/${id}` })

    expect(Object.keys(response.json<object>()).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
      'phone',
      'updatedAt',
    ])
  })
})

/*
 * O ponto central da TASK-API-04: "não existe" e "id malformado" são situações
 * diferentes e precisam ser distinguíveis por quem consome a API. Um cliente
 * que recebe 404 sabe que o recurso sumiu; um que recebe 400 sabe que montou a
 * URL errado. Colapsar os dois num status só esconde bug de integração.
 */
describe('GET /users/:id — 404 e 400 são distinguíveis', () => {
  it('responde 404 para UUID válido que não existe', async () => {
    const missingId = '00000000-0000-4000-8000-000000000000'

    const response = await app.inject({ method: 'GET', url: `/users/${missingId}` })
    const body = response.json<ErrorBody>()

    expect(response.statusCode).toBe(404)
    expect(body.error.code).toBe('USER_NOT_FOUND')
  })

  it('responde 400 para id que não é UUID, apontando o campo', async () => {
    const response = await app.inject({ method: 'GET', url: '/users/nao-e-uuid' })
    const body = response.json<ErrorBody>()

    expect(response.statusCode).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAM')
    expect(body.error.details?.[0]?.field).toBe('id')
  })

  it.each([
    ['numérico', '12345'],
    ['UUID truncado', '18dd9408-ea73-4f6a-af1f'],
    ['UUID com caractere inválido', '18dd9408-ea73-4f6a-af1f-8c09a0a5c89z'],
    ['tentativa de injeção', "1' OR '1'='1"],
  ])('responde 400 para id %s, sem chegar ao banco', async (_case, id) => {
    const response = await app.inject({ method: 'GET', url: `/users/${encodeURIComponent(id)}` })

    expect(response.statusCode).toBe(400)
    expect(response.json<ErrorBody>().error.code).toBe('INVALID_PARAM')
  })

  it('id malformado é barrado na validação, sem chegar ao Postgres', async () => {
    const response = await app.inject({ method: 'GET', url: '/users/nao-e-uuid' })
    const body = response.body.toLowerCase()

    expect(response.statusCode).not.toBe(500)
    // Mensagem do driver que apareceria se o valor tivesse chegado ao banco.
    expect(body).not.toContain('invalid input syntax')
    expect(body).not.toContain('22p02')
    // A mensagem que deve aparecer é a nossa, escrita em português.
    expect(body).toContain('id deve ser um uuid')
  })
})

describe('GET /users/:id — após remoção lógica dos dados', () => {
  it('deixa de encontrar o usuário quando a tabela é esvaziada', async () => {
    const id = await createUser({ name: 'Diego Reis', email: 'diego@exemplo.com' })
    expect((await app.inject({ method: 'GET', url: `/users/${id}` })).statusCode).toBe(200)

    await clearUsers(db)

    const response = await app.inject({ method: 'GET', url: `/users/${id}` })
    expect(response.statusCode).toBe(404)
  })
})
