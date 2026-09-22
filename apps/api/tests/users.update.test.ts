import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'
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

interface UserBody {
  id: string
  name: string
  email: string
  phone: string | null
  createdAt: string
  updatedAt: string
}

interface ErrorBody {
  error: { code: string; message: string; details?: { field: string; message: string }[] }
}

async function create(payload: Record<string, unknown>): Promise<UserBody> {
  const response = await app.inject({ method: 'POST', url: '/users', payload })

  return response.json<UserBody>()
}

function patch(id: string, payload: InjectOptions['payload']): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'PATCH', url: `/users/${id}`, payload })
}

describe('PATCH /users/:id — atualização parcial', () => {
  it('altera apenas o campo enviado, preservando os demais', async () => {
    const user = await create({
      name: 'Ana Souza',
      email: 'ana@exemplo.com',
      phone: '(11) 91111-1111',
    })

    const response = await patch(user.id, { name: 'Ana Souza Lima' })
    const body = response.json<UserBody>()

    expect(response.statusCode).toBe(200)
    expect(body.name).toBe('Ana Souza Lima')
    expect(body.email).toBe('ana@exemplo.com')
    expect(body.phone).toBe('(11) 91111-1111')
  })

  it('permite alterar o email', async () => {
    const user = await create({ name: 'Bruno Lima', email: 'bruno@exemplo.com' })

    const response = await patch(user.id, { email: 'bruno.novo@exemplo.com' })

    expect(response.json<UserBody>().email).toBe('bruno.novo@exemplo.com')
  })

  it('permite limpar o phone enviando null', async () => {
    const user = await create({
      name: 'Carla Dias',
      email: 'carla@exemplo.com',
      phone: '(11) 92222-2222',
    })

    const response = await patch(user.id, { phone: null })

    expect(response.json<UserBody>().phone).toBeNull()
  })

  it('remove espaços em volta dos valores enviados', async () => {
    const user = await create({ name: 'Diego Reis', email: 'diego@exemplo.com' })

    const response = await patch(user.id, { name: '  Diego Reis Filho  ' })

    expect(response.json<UserBody>().name).toBe('Diego Reis Filho')
  })

  it('persiste a alteração, e não apenas a devolve na resposta', async () => {
    const user = await create({ name: 'Elisa Prado', email: 'elisa@exemplo.com' })
    await patch(user.id, { name: 'Elisa Prado Souza' })

    const response = await app.inject({ method: 'GET', url: `/users/${user.id}` })

    expect(response.json<UserBody>().name).toBe('Elisa Prado Souza')
  })

  it('preserva createdAt ao atualizar', async () => {
    const user = await create({ name: 'Fabio Melo', email: 'fabio@exemplo.com' })

    const response = await patch(user.id, { name: 'Fabio Melo Junior' })

    expect(response.json<UserBody>().createdAt).toBe(user.createdAt)
  })

  it('avança updatedAt a cada atualização', async () => {
    const user = await create({ name: 'Gabi Nunes', email: 'gabi@exemplo.com' })

    const first = (await patch(user.id, { name: 'Gabi N.' })).json<UserBody>()
    await new Promise((resolve) => setTimeout(resolve, 10))
    const second = (await patch(user.id, { name: 'Gabi Nunes Silva' })).json<UserBody>()

    expect(new Date(second.updatedAt).getTime()).toBeGreaterThan(
      new Date(first.updatedAt).getTime(),
    )
  })

  /*
   * `created_at` vem do relógio do Postgres. Se `updated_at` viesse do relógio
   * do Node, qualquer divergência entre as duas máquinas produziria um
   * registro atualizado "antes" de ter sido criado.
   */
  it('nunca produz updatedAt anterior a createdAt', async () => {
    const user = await create({ name: 'Heitor Paz', email: 'heitor@exemplo.com' })

    const body = (await patch(user.id, { name: 'Heitor Paz Neto' })).json<UserBody>()

    expect(new Date(body.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(body.createdAt).getTime(),
    )
  })
})

/*
 * O caso que separa uma implementação correta de uma descuidada.
 *
 * Quem resolve unicidade com um SELECT antes do UPDATE quase sempre esquece de
 * excluir o próprio registro da busca, e então salvar um formulário sem trocar
 * o email passa a devolver 409. Aqui quem decide é o índice único, que não
 * compara a linha consigo mesma.
 */
describe('PATCH /users/:id — o próprio email não conflita', () => {
  it('aceita reenviar o mesmo email sem alteração', async () => {
    const user = await create({ name: 'Ana Souza', email: 'ana@exemplo.com' })

    const response = await patch(user.id, { name: 'Ana S.', email: 'ana@exemplo.com' })

    expect(response.statusCode).toBe(200)
    expect(response.json<UserBody>().email).toBe('ana@exemplo.com')
  })

  it('aceita alterar apenas a caixa do próprio email', async () => {
    const user = await create({ name: 'Bruno Lima', email: 'bruno@exemplo.com' })

    const response = await patch(user.id, { email: 'Bruno@Exemplo.com' })

    expect(response.statusCode).toBe(200)
    expect(response.json<UserBody>().email).toBe('Bruno@Exemplo.com')
  })

  it('aceita salvar o formulário inteiro sem mudar nada', async () => {
    const user = await create({
      name: 'Carla Dias',
      email: 'carla@exemplo.com',
      phone: '(11) 93333-3333',
    })

    const response = await patch(user.id, {
      name: user.name,
      email: user.email,
      phone: user.phone,
    })

    expect(response.statusCode).toBe(200)
  })
})

describe('PATCH /users/:id — conflito com outro usuário', () => {
  it('responde 409 ao assumir email já usado por outro', async () => {
    await create({ name: 'Ana Souza', email: 'ana@exemplo.com' })
    const bruno = await create({ name: 'Bruno Lima', email: 'bruno@exemplo.com' })

    const response = await patch(bruno.id, { email: 'ana@exemplo.com' })

    expect(response.statusCode).toBe(409)
    expect(response.json<ErrorBody>().error.code).toBe('USER_EMAIL_TAKEN')
  })

  it('responde 409 também quando difere apenas na caixa', async () => {
    await create({ name: 'Ana Souza', email: 'ana@exemplo.com' })
    const bruno = await create({ name: 'Bruno Lima', email: 'bruno@exemplo.com' })

    const response = await patch(bruno.id, { email: 'ANA@EXEMPLO.COM' })

    expect(response.statusCode).toBe(409)
  })

  it('não altera nenhum campo quando o conflito ocorre', async () => {
    await create({ name: 'Ana Souza', email: 'ana@exemplo.com' })
    const bruno = await create({ name: 'Bruno Lima', email: 'bruno@exemplo.com' })

    await patch(bruno.id, { name: 'Nome Novo', email: 'ana@exemplo.com' })

    const response = await app.inject({ method: 'GET', url: `/users/${bruno.id}` })
    expect(response.json<UserBody>().name).toBe('Bruno Lima')
  })
})

describe('PATCH /users/:id — erros', () => {
  it('responde 404 para UUID válido inexistente', async () => {
    const response = await patch('00000000-0000-4000-8000-000000000000', { name: 'Qualquer' })

    expect(response.statusCode).toBe(404)
    expect(response.json<ErrorBody>().error.code).toBe('USER_NOT_FOUND')
  })

  it('responde 400 para id que não é UUID', async () => {
    const response = await patch('nao-e-uuid', { name: 'Qualquer' })

    expect(response.statusCode).toBe(400)
    expect(response.json<ErrorBody>().error.code).toBe('INVALID_PARAM')
  })

  it('responde 422 para corpo vazio, explicando o que fazer', async () => {
    const user = await create({ name: 'Ana Souza', email: 'ana@exemplo.com' })

    const response = await patch(user.id, {})
    const body = response.json<ErrorBody>()

    expect(response.statusCode).toBe(422)
    expect(body.error.details?.[0]?.message).toContain('ao menos um campo')
  })

  it('responde 422 para email inválido, apontando o campo', async () => {
    const user = await create({ name: 'Ana Souza', email: 'ana@exemplo.com' })

    const response = await patch(user.id, { email: 'nao-e-email' })
    const body = response.json<ErrorBody>()

    expect(response.statusCode).toBe(422)
    expect(body.error.details?.[0]?.field).toBe('email')
  })

  it('responde 422 para nome vazio', async () => {
    const user = await create({ name: 'Ana Souza', email: 'ana@exemplo.com' })

    const response = await patch(user.id, { name: '   ' })

    expect(response.statusCode).toBe(422)
  })

  it('valida o corpo antes de checar a existência do usuário', async () => {
    const response = await patch('00000000-0000-4000-8000-000000000000', { email: 'invalido' })

    // Corpo inválido é problema de quem chamou, independentemente de o
    // usuário existir; responder 404 aqui esconderia o erro real.
    expect(response.statusCode).toBe(422)
  })
})
