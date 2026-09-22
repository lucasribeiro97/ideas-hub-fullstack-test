import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { TestProject } from 'vitest/node'
import { createDatabase } from '../../src/db/client.js'
import { applyMigrations } from '../../src/db/migrate.js'

/**
 * Sobe UM PostgreSQL efêmero para toda a execução da suíte (risco R4).
 *
 * Um container por arquivo de teste custaria alguns segundos cada; um por
 * execução paga esse custo uma vez só.
 *
 * A imagem é a mesma do docker-compose.yml de propósito: testar contra uma
 * versão diferente da que roda em desenvolvimento esconderia justamente as
 * diferenças de comportamento que importam.
 */
let container: StartedPostgreSqlContainer | undefined

export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()

  const databaseUrl = container.getConnectionUri()

  // As migrations aplicadas aqui são exatamente as mesmas de produção — é o
  // motivo de `applyMigrations` ser exportada como função em src/db.
  const { db, pool } = createDatabase(databaseUrl)
  try {
    await applyMigrations(db)
  } finally {
    await pool.end()
  }

  project.provide('databaseUrl', databaseUrl)
}

export async function teardown(): Promise<void> {
  await container?.stop()
}

declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string
  }
}
