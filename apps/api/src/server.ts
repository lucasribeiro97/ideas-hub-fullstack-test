import { buildApp } from './app.js'
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

  const app = await buildApp(env)

  const encerrar = async (sinal: string): Promise<void> => {
    app.log.info({ sinal }, 'encerrando')
    await app.close()
    process.exit(0)
  }

  process.on('SIGINT', () => void encerrar('SIGINT'))
  process.on('SIGTERM', () => void encerrar('SIGTERM'))

  try {
    await app.listen({ port: env.PORT, host: env.HOST })
  } catch (error) {
    app.log.error(error, 'falha ao iniciar o servidor')
    process.exit(1)
  }
}

void main()
