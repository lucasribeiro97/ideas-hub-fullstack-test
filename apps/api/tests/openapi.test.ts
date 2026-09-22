import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/lib/env.js'
import { DOCS_ROUTE } from '../src/lib/openapi.js'
import { connectTestDatabase } from './helpers/database.js'

const { db, pool } = connectTestDatabase()

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://ignorado-nos-testes',
  WEATHER_API_KEY: 'chave-de-teste',
})

let app: FastifyInstance

interface OpenApiDocument {
  openapi: string
  info: { title: string; version: string; description?: string }
  tags?: { name: string }[]
  paths: Record<string, Record<string, OpenApiOperation>>
}

interface OpenApiOperation {
  summary?: string
  tags?: string[]
  parameters?: { name: string; in: string; required?: boolean }[]
  requestBody?: unknown
  responses: Record<string, { description?: string }>
}

let document: OpenApiDocument

beforeAll(async () => {
  app = await buildApp(env, { db })
  await app.ready()

  const response = await app.inject({ method: 'GET', url: `${DOCS_ROUTE}/json` })
  document = response.json<OpenApiDocument>()
})

afterAll(async () => {
  await app.close()
  await pool.end()
})

describe('documento OpenAPI', () => {
  it('é servido e declara a versão do padrão', () => {
    expect(document.openapi).toMatch(/^3\./)
    expect(document.info.title).toContain('Ideas Hub')
  })

  it('explica que o código do erro é a parte estável do contrato', () => {
    // Um cliente que decide pela mensagem quebra quando a redação muda.
    expect(document.info.description).toMatch(/code.*estável|estável.*code/is)
  })

  it('a interface do Swagger responde', async () => {
    const response = await app.inject({ method: 'GET', url: DOCS_ROUTE })

    expect(response.statusCode).toBeLessThan(400)
  })
})

/*
 * Critério S10: o contrato documentado precisa cobrir os seis endpoints do
 * enunciado, e não apenas alguns.
 */
describe('cobertura dos endpoints', () => {
  it.each([
    ['post', '/users', 'Cadastrar um usuário'],
    ['get', '/users', 'Listar e pesquisar'],
    ['get', '/users/{id}', 'Buscar pelo ID'],
    ['patch', '/users/{id}', 'Atualizar'],
    ['delete', '/users/{id}', 'Remover'],
    ['get', '/weather/{city}', 'Consultar o clima'],
  ])('%s %s está documentado (%s)', (method, path) => {
    expect(document.paths[path]?.[method]).toBeDefined()
  })

  it('cada operação tem resumo e etiqueta', () => {
    const operations = Object.values(document.paths).flatMap((byMethod) =>
      Object.values(byMethod),
    )

    for (const operation of operations) {
      expect(operation.summary).toBeTruthy()
      expect(operation.tags?.length).toBeGreaterThan(0)
    }
  })

  it('os grupos de etiquetas estão descritos', () => {
    expect(document.tags?.map((tag) => tag.name)).toEqual(
      expect.arrayContaining(['users', 'weather', 'health']),
    )
  })
})

/*
 * A documentação é derivada dos mesmos schemas que validam as requisições.
 * Estes testes verificam que a derivação de fato ocorreu — um contrato que não
 * descreve os parâmetros é pior que nenhum, porque parece completo.
 */
describe('parâmetros derivados dos schemas de validação', () => {
  it('a listagem documenta os filtros aceitos', () => {
    const nomes = document.paths['/users']?.['get']?.parameters?.map((p) => p.name) ?? []

    expect(nomes).toEqual(
      expect.arrayContaining(['search', 'page', 'perPage', 'sort', 'order']),
    )
  })

  it('as rotas com identificador documentam o parâmetro como obrigatório', () => {
    const parametro = document.paths['/users/{id}']?.['get']?.parameters?.[0]

    expect(parametro).toMatchObject({ name: 'id', in: 'path', required: true })
  })

  it('as rotas de escrita documentam o corpo esperado', () => {
    expect(document.paths['/users']?.['post']?.requestBody).toBeDefined()
    expect(document.paths['/users/{id}']?.['patch']?.requestBody).toBeDefined()
  })
})

describe('respostas de erro documentadas', () => {
  it('o cadastro documenta conflito e validação', () => {
    const respostas = document.paths['/users']?.['post']?.responses ?? {}

    expect(Object.keys(respostas)).toEqual(expect.arrayContaining(['201', '409', '422']))
  })

  it('as rotas com identificador documentam o 404', () => {
    for (const method of ['get', 'patch', 'delete']) {
      expect(document.paths['/users/{id}']?.[method]?.responses['404']).toBeDefined()
    }
  })

  it('a remoção documenta o 204 sem corpo', () => {
    expect(document.paths['/users/{id}']?.['delete']?.responses['204']).toBeDefined()
  })

  // Os quatro modos de falha da integração climática, que a SPEC §6 cataloga.
  it('o clima documenta os quatro modos de falha da origem', () => {
    const respostas = document.paths['/weather/{city}']?.['get']?.responses ?? {}

    expect(Object.keys(respostas)).toEqual(
      expect.arrayContaining(['200', '404', '429', '502', '504']),
    )
  })

  it('toda resposta documentada tem descrição', () => {
    const respostas = Object.values(document.paths)
      .flatMap((byMethod) => Object.values(byMethod))
      .flatMap((operation) => Object.values(operation.responses))

    for (const resposta of respostas) {
      expect(resposta.description).toBeTruthy()
    }
  })
})

describe('a chave da API não aparece na documentação', () => {
  it('nem no documento, nem nos exemplos', () => {
    // Critério S8: a documentação é pública e não pode revelar segredo.
    const serializado = JSON.stringify(document).toLowerCase()

    expect(serializado).not.toContain('chave-de-teste')
    expect(serializado).not.toContain('weather_api_key')
    expect(serializado).not.toContain('api.weatherapi.com')
  })
})
