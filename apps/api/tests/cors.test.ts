import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/lib/env.js'
import { connectTestDatabase } from './helpers/database.js'

const { db, pool } = connectTestDatabase()

const ORIGIN = 'http://localhost:5173'

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://ignorado-nos-testes',
  WEATHER_API_KEY: 'chave-de-teste',
  CORS_ORIGIN: ORIGIN,
})

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp(env, { db })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await pool.end()
})

/** Reproduz a verificação prévia que o navegador faz antes de métodos não simples. */
function preflight(url: string, method: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'OPTIONS',
    url,
    headers: { origin: ORIGIN, 'access-control-request-method': method, ...headers },
  })
}

/**
 * Cabeçalho HTTP pode chegar como texto ou como lista, dependendo de quantas
 * vezes foi enviado. Converter com `String()` direto produziria
 * "[object Object]" no caso da lista, e o teste passaria a comparar lixo.
 */
function headerAsText(value: unknown): string {
  if (Array.isArray(value)) return value.join(',')

  return typeof value === 'string' ? value : ''
}

function allowedMethods(response: { headers: Record<string, unknown> }): string[] {
  return headerAsText(response.headers['access-control-allow-methods'])
    .split(',')
    .map((method) => method.trim().toUpperCase())
    .filter((method) => method.length > 0)
}

/*
 * Estes testes existem por causa de um bug encontrado só ao usar a interface:
 * excluir um usuário falhava com erro de CORS. O padrão do @fastify/cors
 * libera apenas GET, HEAD e POST — os "métodos simples" da especificação —, e
 * o navegador bloqueia PATCH e DELETE na verificação prévia, antes mesmo de a
 * requisição sair.
 *
 * Nenhum teste de integração pegou isso: `app.inject()` entrega a requisição
 * direto ao roteador e não simula navegador algum. Estes casos fecham essa
 * lacuna exercitando a requisição OPTIONS de propósito.
 */
describe('verificação prévia de CORS', () => {
  it.each([['POST'], ['PATCH'], ['DELETE']])(
    '%s é permitido para a origem configurada',
    async (method) => {
      const response = await preflight('/users/63f1ea59-25ad-41ab-8437-b8c00bed9031', method)

      expect(response.statusCode).toBeLessThan(400)
      expect(allowedMethods(response)).toContain(method)
    },
  )

  it('todos os métodos usados pela interface estão liberados', () => {
    // GET para listar e detalhar, POST para cadastrar, PATCH para editar,
    // DELETE para remover. Faltar qualquer um quebra uma tela.
    return preflight('/users', 'DELETE').then((response) => {
      expect(allowedMethods(response)).toEqual(
        expect.arrayContaining(['GET', 'POST', 'PATCH', 'DELETE']),
      )
    })
  })

  it('o cabeçalho de conteúdo é aceito, senão o corpo em JSON não passa', async () => {
    const response = await preflight('/users', 'POST', {
      'access-control-request-headers': 'content-type',
    })

    expect(headerAsText(response.headers['access-control-allow-headers']).toLowerCase()).toContain(
      'content-type',
    )
  })
})

describe('origem autorizada', () => {
  it('a origem configurada recebe permissão', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/users?perPage=1',
      headers: { origin: ORIGIN },
    })

    expect(response.headers['access-control-allow-origin']).toBe(ORIGIN)
  })

  // Sem essa restrição, qualquer site aberto no navegador da pessoa poderia
  // ler e alterar os dados da API em nome dela.
  it('outra origem não recebe permissão', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/users?perPage=1',
      headers: { origin: 'http://site-nao-autorizado.example' },
    })

    expect(response.headers['access-control-allow-origin']).not.toBe(
      'http://site-nao-autorizado.example',
    )
  })
})
