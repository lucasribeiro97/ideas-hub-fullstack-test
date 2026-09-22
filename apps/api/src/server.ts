import { buildApp } from './app.js'
import { createDatabase } from './db/client.js'
import { EnvValidationError, loadEnv } from './lib/env.js'

/**
 * Ponto de entrada do processo. Excluído da cobertura (SPEC §8): é wiring de
 * inicialização, exercitado indiretamente pelos testes de integração.
 */
async function main(): Promise<void> {
  let env
  try {
    env = loadEnv()
  } catch (error) {
    if (error instanceof EnvValidationError) {
      // Erro de configuração não vai para o logger estruturado: o logger ainda
      // não existe neste ponto, e quem precisa ler isso é a pessoa no terminal.
      process.stderr.write(`\n${error.message}\n\n`)
      process.exit(1)
    }
    throw error
  }

  /*
   * O pool existe antes do servidor, mas quem sabe registrar um erro é o
   * logger do servidor. A indireção resolve a ordem: até o `buildApp` terminar,
   * a falha vai para a saída de erro; depois, para o log estruturado.
   */
  const started: { app?: Awaited<ReturnType<typeof buildApp>> } = {}

  const { db, pool } = createDatabase(env.DATABASE_URL, {
    statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
    onPoolError: (error) => {
      if (started.app === undefined) {
        process.stderr.write(`[pool] conexão ociosa perdida: ${error.message}\n`)

        return
      }

      started.app.log.error({ err: error }, 'conexão ociosa do banco perdida')
    },
  })

  const app = await buildApp(env, { db })
  started.app = app

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'encerrando')
    await app.close()
    await pool.end()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  try {
    await app.listen({ port: env.PORT, host: env.HOST })
  } catch (error) {
    app.log.error(error, 'falha ao iniciar o servidor')
    process.exit(1)
  }
}

void main()
