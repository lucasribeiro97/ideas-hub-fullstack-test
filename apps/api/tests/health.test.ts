import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/lib/env.js'

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  WEATHER_API_KEY: 'chave-de-teste',
})

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp(env)
})

afterAll(async () => {
  await app.close()
})

describe('GET /health', () => {
  it('responde 200 com o status do processo', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })
    const body = response.json<{ status: string; uptimeSeconds: number }>()

    expect(response.statusCode).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0)
  })
})

describe('identificador de requisição', () => {
  it('devolve x-request-id na resposta', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.headers['x-request-id']).toBeTruthy()
  })

  it('gera identificadores distintos para requisições diferentes', async () => {
    const [first, second] = await Promise.all([
      app.inject({ method: 'GET', url: '/health' }),
      app.inject({ method: 'GET', url: '/health' }),
    ])

    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id'])
  })

  it('reaproveita o identificador received para preservar a correlação', async () => {
    const received = 'id-vindo-de-outro-servico'

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': received },
    })

    expect(response.headers['x-request-id']).toBe(received)
  })
})
