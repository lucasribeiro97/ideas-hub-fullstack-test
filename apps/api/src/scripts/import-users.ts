import { access } from 'node:fs/promises'
import { createDatabase } from '../db/client.js'
import { InvalidArgumentError, HELP_TEXT, parseArgs } from './import/args.js'
import { formatReport } from './import/report.js'
import { runImport, totalsMatch } from './import/run.js'

/**
 * Comando de importação: `npm run import -- [opções]`.
 *
 * Só faz o encanamento — argumentos, conexão, saída e código de retorno. A
 * orquestração vive em `import/run.ts`, para ser exercitável por teste sem
 * processo externo.
 */
async function main(): Promise<number> {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    if (error instanceof InvalidArgumentError) {
      process.stderr.write(`\n${error.message}\n\nUse --help para ver as opções.\n\n`)

      return 2
    }
    throw error
  }

  if (args.kind === 'help') {
    process.stdout.write(`${HELP_TEXT}\n`)

    return 0
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    process.stderr.write('\nDATABASE_URL não definida. Copie o .env.example para .env.\n\n')

    return 2
  }

  // Falhar aqui evita subir conexão e criar a staging para depois descobrir
  // que o arquivo não existe — erro comum, já que ele precisa ser extraído do
  // .tgz antes da primeira execução.
  try {
    await access(args.filePath)
  } catch {
    process.stderr.write(
      `\nArquivo não encontrado: ${args.filePath}\n\n` +
        'O CSV é distribuído como tar gzipado. Extraia antes de importar:\n' +
        '  tar -xzf data/users.csv.tgz -C data/\n\n',
    )

    return 2
  }

  const { pool } = createDatabase(databaseUrl)

  process.stdout.write(
    `\nImportando de ${args.filePath}` +
      `${args.limit > 0 ? ` (limite de ${args.limit.toLocaleString('pt-BR')} linhas)` : ' (arquivo completo)'}…\n`,
  )

  try {
    const report = await runImport(pool, { filePath: args.filePath, limit: args.limit })
    process.stdout.write(formatReport(report))

    // Contagens que não fecham indicam defeito na importação, não sucesso
    // parcial: o código de saída precisa refletir isso para não passar numa
    // pipeline de integração contínua.
    return totalsMatch(report) ? 0 : 1
  } catch (error) {
    process.stderr.write(`\nFalha na importação: ${(error as Error).message}\n\n`)

    return 1
  } finally {
    await pool.end()
  }
}

process.exitCode = await main()
