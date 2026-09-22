import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { criarBanco, type Database } from './client.js'

export const PASTA_MIGRATIONS = fileURLToPath(new URL('./migrations', import.meta.url))

/**
 * Aplica as migrations pendentes.
 *
 * Exportada como função para que os testes de integração apliquem o mesmo
 * schema no Postgres efêmero do Testcontainers. Migrations de teste divergindo
 * das de produção seria a pior forma de falso positivo possível.
 */
export async function aplicarMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: PASTA_MIGRATIONS })
}

/** Execução direta via `npm run db:migrate`. */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    process.stderr.write('\nDATABASE_URL não definida. Copie o .env.example para .env.\n\n')
    process.exit(1)
  }

  const { db, pool } = criarBanco(databaseUrl)

  try {
    await aplicarMigrations(db)
    process.stdout.write('Migrations aplicadas.\n')
  } catch (erro) {
    process.stderr.write(`\nFalha ao aplicar migrations: ${(erro as Error).message}\n\n`)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

// Só executa quando chamado como script, não quando importado pelos testes.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main()
}
