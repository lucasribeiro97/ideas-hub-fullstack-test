import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { z } from 'zod'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { sql } from 'drizzle-orm'
import { registerErrorHandling } from '../src/lib/error-handler.js'
import {
  InvalidParamError,
  UserEmailTakenError,
  UserNotFoundError,
  ValidationError,
} from '../src/lib/errors.js'
import { users } from '../src/db/schema.js'
import { connectTestDatabase, clearUsers } from './helpers/database.js'

const { db, pool } = connectTestDatabase()

let app: FastifyInstance

/** Aplicação mínima com rotas que lançam de propósito. */
beforeAll(async () => {
  app = Fastify({ logger: false })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  registerErrorHandling(app)

  // Rotas com validação por schema, para exercitar a distinção 400 vs 422.
  app.withTypeProvider().route({
    method: 'POST',
    url: '/validate-body',
    schema: { body: z.object({ email: z.email('email inválido'), name: z.string().min(1) }) },
    handler: () => ({ ok: true }),
  })
  app.withTypeProvider().route({
    method: 'GET',
    url: '/validate-param/:id',
    schema: { params: z.object({ id: z.uuid('id deve ser um UUID') }) },
    handler: () => ({ ok: true }),
  })
  app.withTypeProvider().route({
    method: 'GET',
    url: '/validate-query',
    schema: { querystring: z.object({ page: z.coerce.number().int().positive() }) },
    handler: () => ({ ok: true }),
  })

  app.get('/not-found', () => {
    throw new UserNotFoundError()
  })
  app.get('/conflict', () => {
    throw new UserEmailTakenError()
  })
  app.get('/invalid-body', () => {
    throw new ValidationError([{ field: 'email', message: 'email inválido' }])
  })
  app.get('/invalid-param', () => {
    throw new InvalidParamError([{ field: 'id', message: 'não é um UUID' }])
  })
  app.get('/zod', () => {
    z.object({ username: z.string() }).parse({ username: 42 })
  })
  app.get('/boom', () => {
    throw new Error('detalhe interno que jamais deve sair daqui')
  })

  // Rota que provoca um erro real do PostgreSQL, não simulado.
  app.get('/database-error', async () => {
    await db.execute(sql`SELECT * FROM tabela_que_nao_existe`)
    return { ok: true }
  })
  app.post('/duplicate-email', async () => {
    await db.insert(users).values({ name: 'Duplicado', email: 'Repetido@Exemplo.com' })
    return { ok: true }
  })

  await app.ready()
  await clearUsers(db)
})

afterAll(async () => {
  await app.close()
  await pool.end()
})

describe('erros de domínio', () => {
  it.each([
    ['/not-found', 404, 'USER_NOT_FOUND'],
    ['/conflict', 409, 'USER_EMAIL_TAKEN'],
    ['/invalid-body', 422, 'VALIDATION_ERROR'],
    ['/invalid-param', 400, 'INVALID_PARAM'],
  ])('%s responde %i com o código %s', async (route, status, code) => {
    const response = await app.inject({ method: 'GET', url: route })

    expect(response.statusCode).toBe(status)
    expect(response.json<{ error: { code: string } }>().error.code).toBe(code)
  })

  it('inclui details apontando o campo rejeitado', async () => {
    const response = await app.inject({ method: 'GET', url: '/invalid-body' })
    const body = response.json<{ error: { details?: { field: string }[] } }>()

    expect(body.error.details).toEqual([{ field: 'email', message: 'email inválido' }])
  })

  it('omite details quando não há campo a apontar', async () => {
    const response = await app.inject({ method: 'GET', url: '/conflict' })

    expect(response.json<{ error: object }>().error).not.toHaveProperty('details')
  })
})

// A distinção entre 400 e 422 é decisão registrada na SPEC §6: 400 para
// requisição malformada no endereçamento, 422 para corpo que viola regra.
describe('validação por schema: 400 para endereçamento, 422 para corpo', () => {
  it('corpo inválido responde 422 apontando o campo', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/validate-body',
      payload: { email: 'nao-e-um-email', name: 'Ana' },
    })
    const body = response.json<{ error: { code: string; details: { field: string }[] } }>()

    expect(response.statusCode).toBe(422)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details[0]?.field).toBe('email')
  })

  it('campo obrigatório ausente é identificado pelo nome, não como (raiz)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/validate-body',
      payload: { email: 'ana@exemplo.com' },
    })
    const body = response.json<{ error: { details: { field: string }[] } }>()

    expect(response.statusCode).toBe(422)
    expect(body.error.details.map((d) => d.field)).toContain('name')
  })

  it('parâmetro de rota inválido responde 400, não 422', async () => {
    const response = await app.inject({ method: 'GET', url: '/validate-param/not-a-uuid' })
    const body = response.json<{ error: { code: string; details: { field: string }[] } }>()

    expect(response.statusCode).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAM')
    expect(body.error.details[0]?.field).toBe('id')
  })

  it('query inválida responde 400', async () => {
    const response = await app.inject({ method: 'GET', url: '/validate-query?page=-5' })

    expect(response.statusCode).toBe(400)
    expect(response.json<{ error: { code: string } }>().error.code).toBe('INVALID_PARAM')
  })

  it('JSON malformado responde 400 no formato padrão, sem detalhe do parser', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/validate-body',
      headers: { 'content-type': 'application/json' },
      payload: '{"email": ',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json<{ error: { code: string } }>().error.code).toBe('INVALID_PARAM')
    expect(response.body.toLowerCase()).not.toContain('json.parse')
  })
})

describe('erros do Zod lançados fora da validação de rota', () => {
  it('vira 422 com os campos rejeitados', async () => {
    const response = await app.inject({ method: 'GET', url: '/zod' })
    const body = response.json<{ error: { code: string; details: { field: string }[] } }>()

    expect(response.statusCode).toBe(422)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details[0]?.field).toBe('username')
  })
})

describe('rota inexistente', () => {
  it('responde 404 no mesmo formato dos demais erros', async () => {
    const response = await app.inject({ method: 'GET', url: '/no-such-route' })

    expect(response.statusCode).toBe(404)
    expect(response.json<{ error: { code: string } }>().error.code).toBe('ROUTE_NOT_FOUND')
  })
})

describe('não vazamento de detalhes internos', () => {
  it('erro inesperado vira 500 genérico, sem a mensagem original', async () => {
    const response = await app.inject({ method: 'GET', url: '/boom' })
    const body = response.json<{ error: { code: string; message: string } }>()

    expect(response.statusCode).toBe(500)
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(response.body).not.toContain('detalhe interno')
    expect(response.body).not.toContain('stack')
  })

  // Aceite da TASK-API-02: erro real de banco, não simulado.
  it('erro do PostgreSQL não expõe SQL nem texto do driver', async () => {
    const response = await app.inject({ method: 'GET', url: '/database-error' })

    expect(response.statusCode).toBe(500)
    expect(response.json<{ error: { code: string } }>().error.code).toBe('INTERNAL_ERROR')

    const body = response.body.toLowerCase()
    expect(body).not.toContain('tabela_que_nao_existe')
    expect(body).not.toContain('select')
    expect(body).not.toContain('relation')
    expect(body).not.toContain('postgres')
  })
})

describe('violação de unicidade vinda do banco', () => {
  it('é traduzida para 409 mesmo sem tratamento explícito na rota', async () => {
    const first = await app.inject({ method: 'POST', url: '/duplicate-email' })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({ method: 'POST', url: '/duplicate-email' })
    const body = second.json<{ error: { code: string; message: string } }>()

    expect(second.statusCode).toBe(409)
    expect(body.error.code).toBe('USER_EMAIL_TAKEN')
    // A mensagem é voltada a quem usa a API, não ao nome do índice.
    expect(body.error.message).not.toContain('users_email_lower_unique')
  })
})
