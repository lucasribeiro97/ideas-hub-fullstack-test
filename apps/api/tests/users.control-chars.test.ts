import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/lib/env.js'
import { clearUsers, connectTestDatabase } from './helpers/database.js'

/*
 * O byte NUL virava 500 na API, e o catálogo não prevê isso.
 *
 * NUL não é espaço em branco, então atravessava o `trim()` e o validador de
 * email, chegava ao Postgres como parâmetro e era recusado lá com SQLSTATE
 * 22021. Esse erro não é `AppError`, não é violação de unicidade, não é
 * validação do Fastify e não tem `statusCode` — caía no ramo genérico do
 * tratador: `500 INTERNAL_ERROR` para quem chamou e uma linha `error` com pilha
 * completa no log.
 *
 * O prejuízo tem dois lados. Quem chama recebe "erro interno" e não tem como
 * saber que o problema é da própria requisição, quando a SPEC §6 manda `400`
 * para parâmetro malformado e `422` para corpo inválido. E quem opera passa a
 * ter um gerador de ruído acionável por qualquer cliente: cada requisição
 * dessas incrementa a taxa de 5xx que alimenta alarme.
 *
 * Encontrado por revisão, junto com o mesmo byte derrubando a importação.
 */

const NUL = String.fromCharCode(0)
/** DEL, para confirmar que a regra não se limita ao NUL. */
const DEL = String.fromCharCode(127)

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
  await clearUsers(db)
})

afterAll(async () => {
  await app.close()
  await pool.end()
})

describe('caractere de controle em parâmetro de busca', () => {
  it('devolve 400 do catálogo, e não 500', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/users?search=${encodeURIComponent(`an${NUL}a`)}`,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_PARAM' } })
  })
})

describe('caractere de controle no corpo', () => {
  it.each([
    ['name', { name: `An${NUL}a`, email: 'controle-nome@exemplo.com' }],
    ['email', { name: 'Ana', email: `contro${NUL}le@exemplo.com` }],
    ['phone', { name: 'Ana', email: 'controle-fone@exemplo.com', phone: `11${NUL}9` }],
    ['name com DEL', { name: `An${DEL}a`, email: 'controle-del@exemplo.com' }],
  ])('em %s devolve 422 do catálogo, e não 500', async (_campo, payload) => {
    const response = await app.inject({ method: 'POST', url: '/users', payload })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
  })

  it('o detalhe aponta o campo, para a interface exibir junto dele', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { name: `An${NUL}a`, email: 'detalhe-controle@exemplo.com' },
    })

    expect(response.json()).toMatchObject({
      error: { details: [{ field: 'name' }] },
    })
  })

  it('a edição aplica a mesma regra da criação', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { name: 'Base', email: 'base-controle@exemplo.com' },
    })
    const { id } = created.json<{ id: string }>()

    const response = await app.inject({
      method: 'PATCH',
      url: `/users/${id}`,
      payload: { name: `Ed${NUL}itado` },
    })

    expect(response.statusCode).toBe(422)
  })
})

describe('texto legítimo', () => {
  it('acento, ideograma e emoji continuam aceitos', async () => {
    // A regra precisa mirar o que quebra o banco, não tudo que foge do ASCII.
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { name: 'José Ñuñez 中文 🙂', email: 'jose.unicode@exemplo.com' },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ name: 'José Ñuñez 中文 🙂' })
  })

  it('busca com acento continua funcionando', async () => {
    const response = await app.inject({ method: 'GET', url: '/users?search=José' })

    expect(response.statusCode).toBe(200)
  })
})
