import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { conectarBancoDeTeste, limparUsuarios } from './helpers/database.js'
import { users } from '../src/db/schema.js'

const { db, pool } = conectarBancoDeTeste()

beforeEach(async () => {
  await limparUsuarios(db)
})

afterAll(async () => {
  await pool.end()
})

describe('ambiente de teste de integração', () => {
  it('escreve e lê um usuário no Postgres efêmero', async () => {
    const [criado] = await db
      .insert(users)
      .values({ name: 'Ana Souza', email: 'ana@exemplo.com' })
      .returning()

    expect(criado).toBeDefined()
    expect(criado?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/)
    expect(criado?.createdAt).toBeInstanceOf(Date)

    const encontrados = await db.select().from(users).where(eq(users.email, 'ana@exemplo.com'))
    expect(encontrados).toHaveLength(1)
  })

  it('limpa a tabela entre casos, garantindo isolamento', async () => {
    const existentes = await db.select().from(users)
    expect(existentes).toHaveLength(0)
  })
})

describe('migrations aplicadas no container', () => {
  it('aplica a constraint de email sem distinção de caixa', async () => {
    await db.insert(users).values({ name: 'Bruno Lima', email: 'Bruno@Exemplo.com' })

    const erro = await db
      .insert(users)
      .values({ name: 'Outro Bruno', email: 'bruno@exemplo.com' })
      .then(() => undefined)
      .catch((e: unknown) => e)

    // O Drizzle embrulha o erro do driver, então a identificação precisa vir de
    // `cause`, não da mensagem. É exatamente essa a informação que a camada de
    // erros da API usa para traduzir violação de unicidade em HTTP 409.
    const causa = (erro as { cause?: { code?: string; constraint?: string } }).cause

    expect(causa?.code).toBe('23505')
    expect(causa?.constraint).toBe('users_email_lower_unique')
  })

  it('preserva a caixa original do email gravado', async () => {
    await db.insert(users).values({ name: 'Carla Dias', email: 'Carla.Dias@Exemplo.com' })

    const [encontrado] = await db.select().from(users)
    expect(encontrado?.email).toBe('Carla.Dias@Exemplo.com')
  })

  it('aceita phone nulo, por ser campo opcional', async () => {
    const [criado] = await db
      .insert(users)
      .values({ name: 'Diego Reis', email: 'diego@exemplo.com' })
      .returning()

    expect(criado?.phone).toBeNull()
  })

  it('tem a extensão pg_trgm disponível para a busca parcial', async () => {
    // A migration cria a extensão; sem ela os índices GIN não existiriam.
    // Verificar aqui evita que uma migration futura a remova sem ninguém notar.
    const resultado = await db.execute<{ existe: boolean }>(
      sql`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS existe`,
    )

    expect(resultado.rows[0]?.existe).toBe(true)
  })
})
