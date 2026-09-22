/**
 * Argumentos do comando de importação (TASK-IMPORT-04).
 *
 * Escrito à mão em vez de usar biblioteca: são duas opções, e um parser de
 * linha de comando completo seria dependência sem uso concreto.
 */

/** Caminho relativo a `apps/api`, que é onde o script roda. */
export const DEFAULT_FILE = '../../data/users.csv'

/**
 * Padrão de 500 mil linhas (premissa P6): quem avalia o projeto roda o comando
 * e espera segundos, não minutos. `--limit=0` processa o arquivo completo.
 */
export const DEFAULT_LIMIT = 500_000

export interface ImportArgs {
  kind: 'run'
  filePath: string
  limit: number
}

export interface HelpArgs {
  kind: 'help'
}

export class InvalidArgumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidArgumentError'
  }
}

/** Aceita tanto `--limit=100` quanto `--limit 100`. */
function readValue(argv: string[], index: number, name: string): { value: string; next: number } {
  const current = argv[index] ?? ''
  const inline = current.indexOf('=')

  if (inline !== -1) return { value: current.slice(inline + 1), next: index + 1 }

  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new InvalidArgumentError(`A opção ${name} exige um valor.`)
  }

  return { value, next: index + 2 }
}

export function parseArgs(argv: string[]): ImportArgs | HelpArgs {
  let filePath = DEFAULT_FILE
  let limit = DEFAULT_LIMIT
  let index = 0

  while (index < argv.length) {
    const arg = argv[index] ?? ''

    if (arg === '--help' || arg === '-h') return { kind: 'help' }

    if (arg === '--file' || arg.startsWith('--file=')) {
      const read = readValue(argv, index, '--file')
      if (read.value.length === 0) throw new InvalidArgumentError('A opção --file exige um valor.')
      filePath = read.value
      index = read.next
      continue
    }

    if (arg === '--limit' || arg.startsWith('--limit=')) {
      const read = readValue(argv, index, '--limit')

      // `Number('')` é 0, e 0 significa "arquivo inteiro". Sem esta guarda,
      // um `--limit=` digitado por engano processaria 10 milhões de linhas em
      // vez de avisar do erro.
      const parsed = read.value.trim() === '' ? Number.NaN : Number(read.value)

      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new InvalidArgumentError(
          `--limit deve ser um inteiro maior ou igual a zero. Recebido: "${read.value}".`,
        )
      }

      limit = parsed
      index = read.next
      continue
    }

    throw new InvalidArgumentError(`Opção desconhecida: "${arg}". Use --help para ver as opções.`)
  }

  return { kind: 'run', filePath, limit }
}

export const HELP_TEXT = `
Importa os usuários do CSV de origem para o PostgreSQL.

  npm run import -- [opções]

Opções:
  --file <caminho>   Arquivo CSV a importar.
                     Padrão: ${DEFAULT_FILE}
  --limit <n>        Máximo de linhas de dados a processar.
                     Use 0 para o arquivo completo.
                     Padrão: ${DEFAULT_LIMIT.toLocaleString('pt-BR')}
  -h, --help         Mostra esta ajuda.

Exemplos:
  npm run import                         # 500 mil linhas
  npm run import -- --limit=0            # arquivo completo
  npm run import -- --file=./amostra.csv --limit=1000

O arquivo de origem é distribuído como tar gzipado. Extraia antes:
  tar -xzf data/users.csv.tgz -C data/
`.trim()
