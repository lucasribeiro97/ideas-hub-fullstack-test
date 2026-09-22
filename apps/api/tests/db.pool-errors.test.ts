import { afterEach, describe, expect, it } from 'vitest'
import { inject } from 'vitest'
import { sql } from 'drizzle-orm'
import type { Pool } from 'pg'
import { createDatabase } from '../src/db/client.js'

/*
 * O pool precisa sobreviver a uma conexão ociosa derrubada pelo servidor.
 *
 * O `pg-pool` emite `'error'` no próprio pool quando um cliente que está
 * ocioso falha — não há requisição em andamento para receber a exceção. Sem
 * ouvinte registrado, o `EventEmitter` do Node converte isso em exceção não
 * capturada, e como não existe `process.on('uncaughtException')` em lugar
 * nenhum, o processo inteiro morre. Não a requisição: o processo.
 *
 * Os gatilhos são todos rotineiros em produção: reinício do Postgres,
 * failover, `pg_terminate_backend` disparado por quem administra o banco,
 * `idle_session_timeout` configurado no cluster, queda de rota numa conexão
 * parada. O pool mantém conexões ociosas por 10 segundos (padrão do `pg`),
 * então sob tráfego contínuo a janela de exposição é permanente.
 *
 * Encontrado por revisão, reproduzido subindo a API com
 * `idle_session_timeout=3s`: uma requisição respondeu 200 e seis segundos
 * depois o processo estava morto.
 */

let open: Pool[] = []

afterEach(async () => {
  await Promise.all(open.map((pool) => pool.end()))
  open = []
})

function connect() {
  const created = createDatabase(inject('databaseUrl'))
  open.push(created.pool)

  return created
}

/**
 * Derruba pelo lado do servidor a conexão indicada, como o Postgres faz num
 * reinício. Mira um pid específico para não atingir as conexões dos outros
 * arquivos da suíte, que compartilham o mesmo container.
 */
async function terminateConnection(pid: number): Promise<void> {
  const { db } = connect()

  await db.execute(sql`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid = ${pid}
  `)
}

describe('conexão ociosa derrubada pelo servidor', () => {
  it('emite no pool em vez de virar exceção não capturada', async () => {
    const { db, pool } = connect()

    // Sem este ouvinte o processo morreria aqui — e a suíte inteira junto,
    // o que é exatamente o que torna o defeito difícil de notar em teste.
    const failures: Error[] = []
    pool.on('error', (error) => failures.push(error))

    // Uma consulta cria a conexão; ao terminar, ela volta ociosa para o pool.
    const before = await db.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)

    await terminateConnection(Number(before.rows[0]?.pid))

    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(failures.length).toBeGreaterThan(0)
    expect(failures[0]?.message).toMatch(/terminat/i)
  })

  it('o pool criado por createDatabase já vem com o ouvinte registrado', () => {
    const { pool } = connect()

    // A asserção é sobre a fábrica, não sobre este teste: quem chama
    // `createDatabase` não deve precisar lembrar de registrar nada.
    expect(pool.listenerCount('error')).toBeGreaterThan(0)
  })

  it('continua atendendo depois de perder as conexões ociosas', async () => {
    const { db } = connect()

    const before = await db.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)
    await terminateConnection(Number(before.rows[0]?.pid))
    await new Promise((resolve) => setTimeout(resolve, 500))

    // O pool descarta o cliente morto e abre outro. É o comportamento que o
    // `pg` já implementa; o ouvinte existe para que chegar até aqui seja
    // possível.
    const after = await db.execute<{ ok: number }>(sql`SELECT 1 AS ok`)

    expect(Number(after.rows[0]?.ok)).toBe(1)
  })
})
