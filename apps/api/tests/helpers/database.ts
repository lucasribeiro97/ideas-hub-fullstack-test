import { inject } from 'vitest'
import { sql } from 'drizzle-orm'
import type { Pool } from 'pg'
import { criarBanco, type Database } from '../../src/db/client.js'

/**
 * Conecta ao Postgres efêmero criado pelo global-setup.
 *
 * Cada arquivo de teste abre o próprio pool e o fecha ao final; a URL vem do
 * container compartilhado via `provide`/`inject`.
 */
export function conectarBancoDeTeste(): { db: Database; pool: Pool } {
  return criarBanco(inject('databaseUrl'))
}

/**
 * Esvazia a tabela entre casos.
 *
 * `TRUNCATE` em vez de `DELETE` porque reinicia o estado sem deixar tuplas
 * mortas acumulando ao longo da suíte.
 */
export async function limparUsuarios(db: Database): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE users`)
}
