import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
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
  error: { code: string; message: string }
}

async function create(payload: Record<string, unknown>): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/users', payload })

  return response.json<{ id: string }>().id
}

function remove(id: string): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'DELETE', url: `/users/${id}` })
}

async function countUsers(): Promise<number> {
  const { rows } = await db.execute<{ total: number }>(
    sql`SELECT count(*)::int AS total FROM users`,
  )

  return rows[0]?.total ?? 0
}

describe('DELETE /users/:id — remoção', () => {
  it('responde 204 sem corpo', async () => {
    const id = await create({ name: 'Ana Souza', email: 'ana@exemplo.com' })

    const response = await remove(id)

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
  })

  it('remove de fato a linha do banco, não apenas marca', async () => {
    const id = await create({ name: 'Bruno Lima', email: 'bruno@exemplo.com' })
    expect(await countUsers()).toBe(1)

    await remove(id)

    expect(await countUsers()).toBe(0)
  })

  it('o usuário removido deixa de ser encontrado', async () => {
    const id = await create({ name: 'Carla Dias', email: 'carla@exemplo.com' })
    await remove(id)

    const response = await app.inject({ method: 'GET', url: `/users/${id}` })

    expect(response.statusCode).toBe(404)
  })

  it('o usuário removido some da listagem e do total', async () => {
    const id = await create({ name: 'Diego Reis', email: 'diego@exemplo.com' })
    await create({ name: 'Elisa Prado', email: 'elisa@exemplo.com' })

    await remove(id)

    const response = await app.inject({ method: 'GET', url: '/users' })
    const body = response.json<{ data: { id: string }[]; meta: { total: number } }>()

    expect(body.meta.total).toBe(1)
    expect(body.data.map((u) => u.id)).not.toContain(id)
  })

  it('remove apenas o usuário indicado', async () => {
    const target = await create({ name: 'Fabio Melo', email: 'fabio@exemplo.com' })
    const other = await create({ name: 'Gabi Nunes', email: 'gabi@exemplo.com' })

    await remove(target)

    const response = await app.inject({ method: 'GET', url: `/users/${other}` })
    expect(response.statusCode).toBe(200)
  })

  /*
   * Sem soft delete (SPEC §12): o email volta a ficar livre após a remoção.
   * Se a linha permanecesse marcada como removida, o índice único continuaria
   * bloqueando o endereço e recadastrar daria 409 sem explicação visível.
   */
  it('libera o email para novo cadastro após a remoção', async () => {
    const id = await create({ name: 'Heitor Paz', email: 'heitor@exemplo.com' })
    await remove(id)

    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { name: 'Heitor Paz Neto', email: 'heitor@exemplo.com' },
    })

    expect(response.statusCode).toBe(201)
  })
})

describe('DELETE /users/:id — erros', () => {
  it('responde 404 para UUID válido inexistente', async () => {
    const response = await remove('00000000-0000-4000-8000-000000000000')

    expect(response.statusCode).toBe(404)
    expect(response.json<ErrorBody>().error.code).toBe('USER_NOT_FOUND')
  })

  // Sem o `returning`, remover um id inexistente responderia 204 e o cliente
  // acharia que a operação funcionou.
  it('remover duas vezes responde 204 e depois 404', async () => {
    const id = await create({ name: 'Ana Souza', email: 'ana@exemplo.com' })

    expect((await remove(id)).statusCode).toBe(204)
    expect((await remove(id)).statusCode).toBe(404)
  })

  it('responde 400 para id que não é UUID', async () => {
    const response = await remove('nao-e-uuid')

    expect(response.statusCode).toBe(400)
    expect(response.json<ErrorBody>().error.code).toBe('INVALID_PARAM')
  })

  it('id malformado não remove nada', async () => {
    await create({ name: 'Ana Souza', email: 'ana@exemplo.com' })

    await remove('nao-e-uuid')

    expect(await countUsers()).toBe(1)
  })
})
