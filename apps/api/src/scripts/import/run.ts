import type { Pool } from 'pg'
import { mergeStagingIntoUsers } from './dedupe.js'
import { createImportStats, streamValidUsers, type RejectedLine } from './parse.js'
import { copyUsersToStaging, createStagingTable, dropStagingTable } from './staging.js'

export interface ImportReport {
  linesRead: number
  valid: number
  rejected: number
  blankLines: number
  rejectionsByReason: Record<string, number>
  rejectionSamples: RejectedLine[]
  inserted: number
  duplicatesInFile: number
  alreadyInDatabase: number
  durations: { copyMs: number; mergeMs: number; totalMs: number }
}

export interface RunImportOptions {
  filePath: string
  limit: number
}

function elapsedMs(since: bigint): number {
  return Number(process.hrtime.bigint() - since) / 1e6
}

/**
 * Executa a importação completa (TASK-IMPORT-04).
 *
 * Separada da entrada de linha de comando para que os testes exercitem a
 * orquestração inteira sem processo externo.
 *
 * A staging é removida ao final mesmo em caso de falha: deixá-la para trás
 * ocuparia disco e faria a execução seguinte começar com dados de uma carga
 * interrompida.
 */
export async function runImport(pool: Pool, options: RunImportOptions): Promise<ImportReport> {
  const startedAt = process.hrtime.bigint()
  const stats = createImportStats()

  try {
    await createStagingTable(pool)

    const copyStartedAt = process.hrtime.bigint()
    await copyUsersToStaging(
      pool,
      streamValidUsers(options.filePath, { stats, limit: options.limit }),
    )
    const copyMs = elapsedMs(copyStartedAt)

    const mergeStartedAt = process.hrtime.bigint()
    const merge = await mergeStagingIntoUsers(pool)
    const mergeMs = elapsedMs(mergeStartedAt)

    return {
      linesRead: stats.linesRead,
      valid: stats.valid,
      rejected: stats.rejected,
      blankLines: stats.blankLines,
      rejectionsByReason: stats.rejectionsByReason,
      rejectionSamples: stats.samples,
      inserted: merge.inserted,
      duplicatesInFile: merge.duplicatesInFile,
      alreadyInDatabase: merge.alreadyInDatabase,
      durations: { copyMs, mergeMs, totalMs: elapsedMs(startedAt) },
    }
  } finally {
    await dropStagingTable(pool)
  }
}

/**
 * Confere se as contagens fecham.
 *
 * Um relatório cujos números não somam é pior que nenhum relatório: passa a
 * impressão de que a importação foi auditada quando não foi. A verificação é
 * feita a cada execução, e não apenas nos testes.
 */
export function totalsMatch(report: ImportReport): boolean {
  const accounted =
    report.inserted +
    report.duplicatesInFile +
    report.alreadyInDatabase +
    report.rejected +
    report.blankLines

  return accounted === report.linesRead
}
