import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'
import { sql } from 'drizzle-orm'
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

function post(payload: InjectOptions['payload']): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'POST', url: '/users', payload })
}

describe('POST /users — criação', () => {
  it('responde 201 com o usuário criado', async () => {
    const response = await post({ name: 'Ana Souza', email: 'ana@exemplo.com' })
    const body = response.json<{ id: string; name: string; email: string; phone: string | null }>()

    expect(response.statusCode).toBe(201)
    expect(body.name).toBe('Ana Souza')
    expect(body.email).toBe('ana@exemplo.com')
    expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/)
  })

  it('aceita phone e o devolve no corpo', async () => {
    const response = await post({
      name: 'Bruno Lima',
      email: 'bruno@exemplo.com',
      phone: '(11) 98888-7777',
    })

    expect(response.statusCode).toBe(201)
    expect(response.json<{ phone: string }>().phone).toBe('(11) 98888-7777')
  })

  it('trata phone como opcional, devolvendo null quando ausente', async () => {
    const response = await post({ name: 'Carla Dias', email: 'carla@exemplo.com' })

    expect(response.json<{ phone: null }>().phone).toBeNull()
  })

  it('trata string vazia em phone como ausência, não como valor', async () => {
    const response = await post({ name: 'Diego Reis', email: 'diego@exemplo.com', phone: '' })

    expect(response.statusCode).toBe(201)
    expect(response.json<{ phone: null }>().phone).toBeNull()
  })

  it('devolve timestamps em formato ISO', async () => {
    const response = await post({ name: 'Elisa Prado', email: 'elisa@exemplo.com' })
    const body = response.json<{ createdAt: string; updatedAt: string }>()

    expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(new Date(body.createdAt).toString()).not.toBe('Invalid Date')
    expect(body.updatedAt).toBeTruthy()
  })

  it('remove espaços em volta de nome e email', async () => {
    const response = await post({ name: '  Fabio Melo  ', email: '  fabio@exemplo.com  ' })
    const body = response.json<{ name: string; email: string }>()

    expect(body.name).toBe('Fabio Melo')
    expect(body.email).toBe('fabio@exemplo.com')
  })

  it('não expõe campos além do contrato documentado', async () => {
    const response = await post({ name: 'Gabi Nunes', email: 'gabi@exemplo.com' })

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

describe('POST /users — email duplicado', () => {
  it('responde 409 quando o email já existe', async () => {
    await post({ name: 'Ana Souza', email: 'ana@exemplo.com' })
    const response = await post({ name: 'Outra Ana', email: 'ana@exemplo.com' })
    const body = response.json<ErrorBody>()

    expect(response.statusCode).toBe(409)
    expect(body.error.code).toBe('USER_EMAIL_TAKEN')
  })

  // Premissa P4 da SPEC: unicidade não distingue maiúsculas de minúsculas.
  it('responde 409 mesmo com o email em caixa diferente', async () => {
    await post({ name: 'Ana Souza', email: 'Ana@Exemplo.com' })
    const response = await post({ name: 'Outra Ana', email: 'ana@exemplo.COM' })

    expect(response.statusCode).toBe(409)
    expect(response.json<ErrorBody>().error.code).toBe('USER_EMAIL_TAKEN')
  })

  it('preserva a caixa original do primeiro cadastro', async () => {
    const response = await post({ name: 'Ana Souza', email: 'Ana.Souza@Exemplo.com' })

    expect(response.json<{ email: string }>().email).toBe('Ana.Souza@Exemplo.com')
  })

  it('não vaza o nome do índice na mensagem de conflito', async () => {
    await post({ name: 'Ana', email: 'ana@exemplo.com' })
    const response = await post({ name: 'Ana', email: 'ana@exemplo.com' })

    expect(response.body).not.toContain('users_email_lower_unique')
    expect(response.body).not.toContain('23505')
  })
})

describe('POST /users — corpo inválido', () => {
  const invalidBodies: [string, Record<string, unknown>, string][] = [
    ['email sem formato válido', { name: 'Ana', email: 'nao-e-email' }, 'email'],
    ['nome vazio', { name: '   ', email: 'ana@exemplo.com' }, 'name'],
    ['nome ausente', { email: 'ana@exemplo.com' }, 'name'],
    ['email ausente', { name: 'Ana' }, 'email'],
  ]

  it.each(invalidBodies)('responde 422 para %s, apontando o campo', async (_case, payload, field) => {
    const response = await post(payload)
    const body = response.json<ErrorBody>()

    expect(response.statusCode).toBe(422)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details?.map((d) => d.field)).toContain(field)
  })

  it('responde 422 com mensagem em português, não a padrão do Zod', async () => {
    const response = await post({ name: 'Ana', email: 'nao-e-email' })
    const detail = response.json<ErrorBody>().error.details?.[0]

    expect(detail?.message).toBe('email inválido')
  })

  it('rejeita nome acima do limite de 120 caracteres', async () => {
    const response = await post({ name: 'a'.repeat(121), email: 'ana@exemplo.com' })

    expect(response.statusCode).toBe(422)
  })

  it('rejeita corpo ausente', async () => {
    const response = await app.inject({ method: 'POST', url: '/users' })

    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    expect(response.statusCode).toBeLessThan(500)
  })

  it('não cria o usuário quando a validação falha', async () => {
    await post({ name: 'Ana', email: 'nao-e-email' })

    // Consulta direta ao banco: confiar apenas no status da resposta não
    // provaria que nada foi gravado.
    const { rows } = await db.execute<{ total: string }>(
      sql`SELECT count(*)::text AS total FROM users`,
    )

    expect(rows[0]?.total).toBe('0')
  })
})
