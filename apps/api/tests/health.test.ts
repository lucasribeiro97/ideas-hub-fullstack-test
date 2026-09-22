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
    const resposta = await app.inject({ method: 'GET', url: '/health' })
    const corpo = resposta.json<{ status: string; uptimeSeconds: number }>()

    expect(resposta.statusCode).toBe(200)
    expect(corpo.status).toBe('ok')
    expect(corpo.uptimeSeconds).toBeGreaterThanOrEqual(0)
  })
})

describe('identificador de requisição', () => {
  it('devolve x-request-id na resposta', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/health' })

    expect(resposta.headers['x-request-id']).toBeTruthy()
  })

  it('gera identificadores distintos para requisições diferentes', async () => {
    const [primeira, segunda] = await Promise.all([
      app.inject({ method: 'GET', url: '/health' }),
      app.inject({ method: 'GET', url: '/health' }),
    ])

    expect(primeira.headers['x-request-id']).not.toBe(segunda.headers['x-request-id'])
  })

  it('reaproveita o identificador recebido para preservar a correlação', async () => {
    const recebido = 'id-vindo-de-outro-servico'

    const resposta = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': recebido },
    })

    expect(resposta.headers['x-request-id']).toBe(recebido)
  })
})
