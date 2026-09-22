import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inject } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/lib/env.js'
import { createDatabase } from '../src/db/client.js'
import { MAX_PAGE } from '../src/modules/users/users.schemas.js'
import { connectTestDatabase } from './helpers/database.js'

/*
 * Nenhuma requisição pode pedir trabalho ilimitado.
 *
 * `perPage` já tinha teto — a SPEC §6 o justifica dizendo que "mantém a
 * latência previsível" —, mas o `OFFSET` não tinha teto nenhum: `page` só
 * exigia `.min(1)`. Com `sort=name`, que não tem índice, cada requisição
 * obrigava o Postgres a varrer a tabela inteira e ordenar em disco, porque um
 * `OFFSET` gigante impede a ordenação limitada ao topo.
 *
 * Medido pela revisão com 220.874 registros: 330 ms de execução e 22 MB de
 * arquivo temporário por requisição. Com 200 requisições dessas em paralelo,
 * uma listagem comum de 12 ms passou a levar 9,3 segundos — as dez conexões do
 * pool ficavam ocupadas e todo o resto esperava na fila. Sem autenticação e sem
 * limite de taxa, é uma URL trivial de construir, e tudo responde 200, então
 * não aparece em nenhum alarme de erro.
 *
 * As duas defesas são complementares e nenhuma substitui a outra: o teto de
 * `page` recusa o pedido absurdo antes de tocar no banco, e o tempo limite de
 * consulta impede que qualquer consulta — inclusive uma que ninguém previu —
 * monopolize uma conexão.
 */

const { db, pool } = connectTestDatabase()

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://ignorado-nos-testes',
  WEATHER_API_KEY: 'chave-de-teste',
})

let app: FastifyInstance
const extraPools: Pool[] = []

beforeAll(async () => {
  app = await buildApp(env, { db })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await Promise.all(extraPools.map((extra) => extra.end()))
  await pool.end()
})

function list(query: string) {
  return app.inject({ method: 'GET', url: `/users?${query}` })
}

describe('teto de page', () => {
  it('aceita a última página permitida', async () => {
    const response = await list(`page=${MAX_PAGE}&perPage=20`)

    expect(response.statusCode).toBe(200)
  })

  it('recusa uma página acima do teto', async () => {
    const response = await list(`page=${MAX_PAGE + 1}&perPage=20`)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_PARAM' } })
  })

  it('recusa a página máxima representável, que era aceita antes', async () => {
    const response = await list('page=9007199254740991&perPage=100&sort=name&order=asc')

    expect(response.statusCode).toBe(400)
  })

  it('o teto é alto o bastante para percorrer a base projetada inteira', () => {
    // A SPEC §3 projeta 1.598.726 usuários distintos na carga completa. Com o
    // menor `perPage` possível, a última página real precisa continuar
    // alcançável — um teto que escondesse dados seria trocar um defeito por
    // outro.
    const smallestPerPage = 10
    const projectedUsers = 1_598_726

    expect(MAX_PAGE).toBeGreaterThan(Math.ceil(projectedUsers / smallestPerPage))
  })

  it('o teto aparece no contrato publicado', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = response.json<{
      paths: Record<string, Record<string, { parameters?: { name: string; schema?: unknown }[] }>>
    }>()

    const pageParam = document.paths['/users']?.['get']?.parameters?.find(
      (parameter) => parameter.name === 'page',
    )

    // Quem gera um cliente a partir do OpenAPI precisa ver o limite; um teto
    // que só existe no servidor vira 400 inesperado do outro lado.
    expect(pageParam?.schema).toMatchObject({ maximum: MAX_PAGE })
  })
})

describe('tempo limite de consulta', () => {
  it('a conexão da API tem tempo limite configurado', async () => {
    const created = createDatabase(inject('databaseUrl'), { statementTimeoutMs: 4000 })
    extraPools.push(created.pool)

    const { rows } = await created.pool.query<{ setting: string }>(
      `SELECT current_setting('statement_timeout') AS setting`,
    )

    expect(rows[0]?.setting).toBe('4s')
  })

  it('uma consulta que ultrapassa o limite é interrompida, e a conexão continua utilizável', async () => {
    const created = createDatabase(inject('databaseUrl'), { statementTimeoutMs: 300 })
    extraPools.push(created.pool)

    await expect(created.pool.query('SELECT pg_sleep(2)')).rejects.toThrow(/statement timeout/i)

    // O que se protege é a conexão, não só a consulta: se ela ficasse
    // inutilizável, o remédio seria pior que a doença.
    const { rows } = await created.pool.query<{ ok: number }>('SELECT 1 AS ok')
    expect(Number(rows[0]?.ok)).toBe(1)
  })

  it('sem o limite configurado a conexão não impõe nenhum, como a importação precisa', async () => {
    const created = createDatabase(inject('databaseUrl'))
    extraPools.push(created.pool)

    const { rows } = await created.pool.query<{ setting: string }>(
      `SELECT current_setting('statement_timeout') AS setting`,
    )

    // A importação leva 35 minutos numa única consulta de merge. Herdar o
    // tempo limite da API a mataria no meio.
    expect(rows[0]?.setting).toBe('0')
  })
})
