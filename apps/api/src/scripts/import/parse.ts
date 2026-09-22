import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { MAX_EMAIL, MAX_NAME, MAX_PHONE } from '../../modules/users/users.schemas.js'

/**
 * Leitura e validação do CSV de origem (TASK-IMPORT-01).
 *
 * Streaming linha a linha: o arquivo tem 935 MB e 10 milhões de linhas, então
 * carregá-lo em memória não é opção. O uso de memória fica constante
 * independentemente do tamanho do arquivo.
 */

export interface ParsedUser {
  /** Posição no arquivo, contando a partir de 1 na primeira linha de dados. */
  lineNumber: number
  id: string
  name: string
  email: string
  phone: string | null
}

export interface RejectedLine {
  lineNumber: number
  reason: string
  /** Trecho da linha original, truncado para não inchar o relatório. */
  excerpt: string
}

export interface ImportStats {
  linesRead: number
  valid: number
  rejected: number
  /**
   * Linhas em branco ignoradas.
   *
   * Não são rejeições: um arquivo terminando com quebra de linha é normal, e
   * reportá-las como defeito seria ruído. Mas somem da conferência se não
   * forem contadas, e um relatório cujos números não fecham é pior que nenhum.
   */
  blankLines: number
  rejectionsByReason: Record<string, number>
  /** Primeiras rejeições, para o relatório. O total vive em `rejected`. */
  samples: RejectedLine[]
}

export function createImportStats(): ImportStats {
  return { linesRead: 0, valid: 0, rejected: 0, blankLines: 0, rejectionsByReason: {}, samples: [] }
}

export const EXPECTED_HEADER = ['id', 'name', 'email', 'phone'] as const

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_EXCERPT = 120
const DEFAULT_MAX_SAMPLES = 20

/**
 * Divide a linha por vírgula.
 *
 * O dataset foi inspecionado antes da implementação e não contém aspas nem
 * vírgulas dentro de campo (SPEC §3): as 10 milhões de linhas têm exatamente
 * quatro campos. Por isso a divisão simples basta, e é bem mais rápida que um
 * parser completo sobre esse volume.
 *
 * A limitação é tratada de forma explícita, não silenciosa: uma linha com
 * aspas ou com número de campos diferente de quatro é **rejeitada com motivo**,
 * nunca interpretada pela metade. O pior caso é perder a linha e vê-la no
 * relatório, jamais gravar dado incorreto.
 */
function splitFields(line: string): string[] | undefined {
  if (line.includes('"')) return undefined

  return line.split(',')
}

/*
 * Caracteres de controle C0, menos tabulação, quebra de linha e retorno — esses
 * três o `escapeCopyValue` já neutraliza, e o enquadramento em linhas já tratou
 * os dois últimos antes de chegar aqui.
 *
 * O byte NUL é o que motivou a regra: ele não é espaço em branco, então
 * sobrevivia ao `trim()` e ao padrão de email, e só era recusado lá na frente
 * pelo Postgres — que aborta o `COPY` inteiro em vez de descartar a linha. Uma
 * linha ruim derrubava a importação inteira, contrariando a promessa escrita
 * logo acima.
 */
// A regra `no-control-regex` existe para pegar caractere de controle colocado
// na expressão por acidente. Aqui ele é justamente o que se procura.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/

function validate(fields: string[], lineNumber: number): ParsedUser | RejectedLine {
  const [id = '', name = '', email = '', phone = ''] = fields
  const reject = (reason: string): RejectedLine => ({
    lineNumber,
    reason,
    excerpt: fields.join(',').slice(0, MAX_EXCERPT),
  })

  // Antes de qualquer outra verificação: o campo com caractere de controle não
  // chega a ser um id, um nome ou um email — é dado corrompido.
  if (fields.some((field) => CONTROL_CHARACTERS.test(field))) {
    return reject('campo com caractere de controle')
  }

  if (!UUID_PATTERN.test(id)) return reject('id não é um UUID válido')

  const trimmedName = name.trim()
  if (trimmedName.length === 0) return reject('nome vazio')
  if (trimmedName.length > MAX_NAME) return reject(`nome acima de ${MAX_NAME} caracteres`)

  const trimmedEmail = email.trim()
  if (trimmedEmail.length === 0) return reject('email vazio')
  if (trimmedEmail.length > MAX_EMAIL) return reject(`email acima de ${MAX_EMAIL} caracteres`)
  if (!EMAIL_PATTERN.test(trimmedEmail)) return reject('email em formato inválido')

  const trimmedPhone = phone.trim()
  if (trimmedPhone.length > MAX_PHONE) return reject(`telefone acima de ${MAX_PHONE} caracteres`)

  return {
    lineNumber,
    id,
    name: trimmedName,
    email: trimmedEmail,
    phone: trimmedPhone.length > 0 ? trimmedPhone : null,
  }
}

function isRejection(result: ParsedUser | RejectedLine): result is RejectedLine {
  return 'reason' in result
}

function record(stats: ImportStats, rejection: RejectedLine, maxSamples: number): void {
  stats.rejected += 1
  stats.rejectionsByReason[rejection.reason] =
    (stats.rejectionsByReason[rejection.reason] ?? 0) + 1

  // Guardar todas as rejeições consumiria memória proporcional ao arquivo —
  // exatamente o que o streaming existe para evitar. O total é contado sempre;
  // só os exemplos são limitados.
  if (stats.samples.length < maxSamples) stats.samples.push(rejection)
}

export class InvalidHeaderError extends Error {
  constructor(found: string) {
    super(
      `Cabeçalho inesperado. Esperado "${EXPECTED_HEADER.join(',')}", encontrado "${found}".`,
    )
    this.name = 'InvalidHeaderError'
  }
}

export interface StreamOptions {
  stats: ImportStats
  /** Máximo de linhas de dados a processar. `0` ou ausente processa tudo. */
  limit?: number
  maxSamples?: number
}

/**
 * Percorre o CSV devolvendo apenas os registros válidos.
 *
 * Gerador assíncrono de propósito: quem consome controla o ritmo, então a
 * escrita no banco aplica contrapressão naturalmente em vez de acumular
 * registros em memória.
 */
export async function* streamValidUsers(
  filePath: string,
  options: StreamOptions,
): AsyncGenerator<ParsedUser> {
  const { stats } = options
  const limit = options.limit ?? 0
  const maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES

  const input = createReadStream(filePath, { encoding: 'utf8' })
  const lines = createInterface({ input, crlfDelay: Infinity })

  let isHeader = true

  try {
    for await (const line of lines) {
      if (isHeader) {
        isHeader = false
        const header = line.trim().split(',')

        // Cabeçalho diferente significa arquivo diferente do esperado. Falhar
        // aqui evita importar 10 milhões de linhas com as colunas trocadas.
        if (header.join(',') !== EXPECTED_HEADER.join(',')) {
          throw new InvalidHeaderError(line.trim().slice(0, MAX_EXCERPT))
        }
        continue
      }

      if (limit > 0 && stats.linesRead >= limit) break

      stats.linesRead += 1

      // Linha em branco no fim do arquivo é comum e não é registro inválido.
      if (line.trim().length === 0) {
        stats.blankLines += 1
        continue
      }

      const fields = splitFields(line)

      if (!fields) {
        record(stats, { lineNumber: stats.linesRead, reason: 'linha contém aspas, não suportadas', excerpt: line.slice(0, MAX_EXCERPT) }, maxSamples)
        continue
      }

      if (fields.length !== EXPECTED_HEADER.length) {
        record(
          stats,
          {
            lineNumber: stats.linesRead,
            reason: `esperados ${EXPECTED_HEADER.length} campos, encontrados ${fields.length}`,
            excerpt: line.slice(0, MAX_EXCERPT),
          },
          maxSamples,
        )
        continue
      }

      const result = validate(fields, stats.linesRead)

      if (isRejection(result)) {
        record(stats, result, maxSamples)
        continue
      }

      stats.valid += 1
      yield result
    }
  } finally {
    // Fecha o descritor mesmo se quem consome interromper a iteração no meio.
    lines.close()
    input.destroy()
  }
}
