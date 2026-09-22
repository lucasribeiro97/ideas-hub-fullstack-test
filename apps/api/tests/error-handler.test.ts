import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { z } from 'zod'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { sql } from 'drizzle-orm'
import { registrarTratamentoDeErros } from '../src/lib/error-handler.js'
import {
  InvalidParamError,
  UserEmailTakenError,
  UserNotFoundError,
  ValidationError,
} from '../src/lib/errors.js'
import { users } from '../src/db/schema.js'
import { conectarBancoDeTeste, limparUsuarios } from './helpers/database.js'

const { db, pool } = conectarBancoDeTeste()

let app: FastifyInstance

/** Aplicação mínima com rotas que lançam de propósito. */
beforeAll(async () => {
  app = Fastify({ logger: false })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  registrarTratamentoDeErros(app)

  // Rotas com validação por schema, para exercitar a distinção 400 vs 422.
  app.withTypeProvider().route({
    method: 'POST',
    url: '/valida-corpo',
    schema: { body: z.object({ email: z.email('email inválido'), name: z.string().min(1) }) },
    handler: () => ({ ok: true }),
  })
  app.withTypeProvider().route({
    method: 'GET',
    url: '/valida-param/:id',
    schema: { params: z.object({ id: z.uuid('id deve ser um UUID') }) },
    handler: () => ({ ok: true }),
  })
  app.withTypeProvider().route({
    method: 'GET',
    url: '/valida-query',
    schema: { querystring: z.object({ page: z.coerce.number().int().positive() }) },
    handler: () => ({ ok: true }),
  })

  app.get('/nao-encontrado', () => {
    throw new UserNotFoundError()
  })
  app.get('/conflito', () => {
    throw new UserEmailTakenError()
  })
  app.get('/invalido', () => {
    throw new ValidationError([{ field: 'email', message: 'email inválido' }])
  })
  app.get('/param-invalido', () => {
    throw new InvalidParamError([{ field: 'id', message: 'não é um UUID' }])
  })
  app.get('/zod', () => {
    z.object({ nome: z.string() }).parse({ nome: 42 })
  })
  app.get('/explode', () => {
    throw new Error('detalhe interno que jamais deve sair daqui')
  })

  // Rota que provoca um erro real do PostgreSQL, não simulado.
  app.get('/erro-de-banco', async () => {
    await db.execute(sql`SELECT * FROM tabela_que_nao_existe`)
    return { ok: true }
  })
  app.post('/email-duplicado', async () => {
    await db.insert(users).values({ name: 'Duplicado', email: 'Repetido@Exemplo.com' })
    return { ok: true }
  })

  await app.ready()
  await limparUsuarios(db)
})

afterAll(async () => {
  await app.close()
  await pool.end()
})

describe('erros de domínio', () => {
  it.each([
    ['/nao-encontrado', 404, 'USER_NOT_FOUND'],
    ['/conflito', 409, 'USER_EMAIL_TAKEN'],
    ['/invalido', 422, 'VALIDATION_ERROR'],
    ['/param-invalido', 400, 'INVALID_PARAM'],
  ])('%s responde %i com o código %s', async (rota, status, code) => {
    const resposta = await app.inject({ method: 'GET', url: rota })

    expect(resposta.statusCode).toBe(status)
    expect(resposta.json<{ error: { code: string } }>().error.code).toBe(code)
  })

  it('inclui details apontando o campo rejeitado', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/invalido' })
    const corpo = resposta.json<{ error: { details?: { field: string }[] } }>()

    expect(corpo.error.details).toEqual([{ field: 'email', message: 'email inválido' }])
  })

  it('omite details quando não há campo a apontar', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/conflito' })

    expect(resposta.json<{ error: object }>().error).not.toHaveProperty('details')
  })
})

// A distinção entre 400 e 422 é decisão registrada na SPEC §6: 400 para
// requisição malformada no endereçamento, 422 para corpo que viola regra.
describe('validação por schema: 400 para endereçamento, 422 para corpo', () => {
  it('corpo inválido responde 422 apontando o campo', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/valida-corpo',
      payload: { email: 'nao-e-um-email', name: 'Ana' },
    })
    const corpo = resposta.json<{ error: { code: string; details: { field: string }[] } }>()

    expect(resposta.statusCode).toBe(422)
    expect(corpo.error.code).toBe('VALIDATION_ERROR')
    expect(corpo.error.details[0]?.field).toBe('email')
  })

  it('campo obrigatório ausente é identificado pelo nome, não como (raiz)', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/valida-corpo',
      payload: { email: 'ana@exemplo.com' },
    })
    const corpo = resposta.json<{ error: { details: { field: string }[] } }>()

    expect(resposta.statusCode).toBe(422)
    expect(corpo.error.details.map((d) => d.field)).toContain('name')
  })

  it('parâmetro de rota inválido responde 400, não 422', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/valida-param/nao-e-uuid' })
    const corpo = resposta.json<{ error: { code: string; details: { field: string }[] } }>()

    expect(resposta.statusCode).toBe(400)
    expect(corpo.error.code).toBe('INVALID_PARAM')
    expect(corpo.error.details[0]?.field).toBe('id')
  })

  it('query inválida responde 400', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/valida-query?page=-5' })

    expect(resposta.statusCode).toBe(400)
    expect(resposta.json<{ error: { code: string } }>().error.code).toBe('INVALID_PARAM')
  })

  it('JSON malformado responde 400 no formato padrão, sem detalhe do parser', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/valida-corpo',
      headers: { 'content-type': 'application/json' },
      payload: '{"email": ',
    })

    expect(resposta.statusCode).toBe(400)
    expect(resposta.json<{ error: { code: string } }>().error.code).toBe('INVALID_PARAM')
    expect(resposta.body.toLowerCase()).not.toContain('json.parse')
  })
})

describe('erros do Zod lançados fora da validação de rota', () => {
  it('vira 422 com os campos rejeitados', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/zod' })
    const corpo = resposta.json<{ error: { code: string; details: { field: string }[] } }>()

    expect(resposta.statusCode).toBe(422)
    expect(corpo.error.code).toBe('VALIDATION_ERROR')
    expect(corpo.error.details[0]?.field).toBe('nome')
  })
})

describe('rota inexistente', () => {
  it('responde 404 no mesmo formato dos demais erros', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/rota-que-nao-existe' })

    expect(resposta.statusCode).toBe(404)
    expect(resposta.json<{ error: { code: string } }>().error.code).toBe('ROUTE_NOT_FOUND')
  })
})

describe('não vazamento de detalhes internos', () => {
  it('erro inesperado vira 500 genérico, sem a mensagem original', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/explode' })
    const corpo = resposta.json<{ error: { code: string; message: string } }>()

    expect(resposta.statusCode).toBe(500)
    expect(corpo.error.code).toBe('INTERNAL_ERROR')
    expect(resposta.body).not.toContain('detalhe interno')
    expect(resposta.body).not.toContain('stack')
  })

  // Aceite da TASK-API-02: erro real de banco, não simulado.
  it('erro do PostgreSQL não expõe SQL nem texto do driver', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/erro-de-banco' })

    expect(resposta.statusCode).toBe(500)
    expect(resposta.json<{ error: { code: string } }>().error.code).toBe('INTERNAL_ERROR')

    const corpo = resposta.body.toLowerCase()
    expect(corpo).not.toContain('tabela_que_nao_existe')
    expect(corpo).not.toContain('select')
    expect(corpo).not.toContain('relation')
    expect(corpo).not.toContain('postgres')
  })
})

describe('violação de unicidade vinda do banco', () => {
  it('é traduzida para 409 mesmo sem tratamento explícito na rota', async () => {
    const primeira = await app.inject({ method: 'POST', url: '/email-duplicado' })
    expect(primeira.statusCode).toBe(200)

    const segunda = await app.inject({ method: 'POST', url: '/email-duplicado' })
    const corpo = segunda.json<{ error: { code: string; message: string } }>()

    expect(segunda.statusCode).toBe(409)
    expect(corpo.error.code).toBe('USER_EMAIL_TAKEN')
    // A mensagem é voltada a quem usa a API, não ao nome do índice.
    expect(corpo.error.message).not.toContain('users_email_lower_unique')
  })
})
