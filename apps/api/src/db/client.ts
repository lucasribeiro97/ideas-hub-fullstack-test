import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'

export type Database = NodePgDatabase<typeof schema>

/**
 * Cria um pool e a instância do Drizzle sobre ele.
 *
 * O pool é devolvido junto porque quem o cria é quem precisa fechá-lo: o
 * servidor no encerramento, e cada suíte de teste ao final. Esconder o pool
 * levaria a conexões penduradas nos testes.
 */
export function createDatabase(databaseUrl: string): { db: Database; pool: Pool } {
  const pool = new Pool({ connectionString: databaseUrl })
  const db = drizzle(pool, { schema })

  return { db, pool }
}
