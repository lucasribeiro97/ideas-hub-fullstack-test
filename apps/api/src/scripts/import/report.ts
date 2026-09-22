import { totalsMatch, type ImportReport } from './run.js'

const n = (value: number): string => value.toLocaleString('pt-BR')

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function percent(part: number, whole: number): string {
  if (whole === 0) return '—'

  return `${((part / whole) * 100).toFixed(1)}%`
}

/**
 * Relatório final da importação (TASK-IMPORT-04).
 *
 * Exigido pelo enunciado: a importação precisa lidar de forma explícita com
 * registros inválidos e emails duplicados, e "explícita" significa visível
 * para quem executa — não apenas tratada no código.
 *
 * Separa duplicata do arquivo de email que já existia no banco: são situações
 * diferentes. A primeira é característica do dataset; a segunda indica
 * reexecução ou carga incremental.
 */
export function formatReport(report: ImportReport): string {
  const lines: string[] = [
    '',
    '─── Importação concluída ───────────────────────────',
    `  Linhas lidas          ${n(report.linesRead).padStart(12)}`,
    `  Importados            ${n(report.inserted).padStart(12)}  ${percent(report.inserted, report.linesRead)}`,
    `  Duplicados no arquivo ${n(report.duplicatesInFile).padStart(12)}  ${percent(report.duplicatesInFile, report.linesRead)}`,
    `  Já existentes no banco${n(report.alreadyInDatabase).padStart(12)}  ${percent(report.alreadyInDatabase, report.linesRead)}`,
    `  Rejeitados            ${n(report.rejected).padStart(12)}  ${percent(report.rejected, report.linesRead)}`,
  ]

  if (report.blankLines > 0) {
    lines.push(`  Linhas em branco      ${n(report.blankLines).padStart(12)}  ignoradas`)
  }

  lines.push('')

  if (report.rejected > 0) {
    lines.push('  Motivos das rejeições:')
    for (const [reason, count] of Object.entries(report.rejectionsByReason).sort(
      (a, b) => b[1] - a[1],
    )) {
      lines.push(`    ${n(count).padStart(10)}  ${reason}`)
    }

    lines.push('')
    lines.push(`  Primeiras linhas rejeitadas (${report.rejectionSamples.length} de ${n(report.rejected)}):`)
    for (const sample of report.rejectionSamples) {
      lines.push(`    linha ${n(sample.lineNumber)}: ${sample.reason}`)
      lines.push(`      ${sample.excerpt}`)
    }
    lines.push('')
  }

  lines.push(
    `  Tempo   copy ${seconds(report.durations.copyMs)}` +
      `   deduplicação ${seconds(report.durations.mergeMs)}` +
      `   total ${seconds(report.durations.totalMs)}`,
  )

  if (report.linesRead > 0 && report.durations.totalMs > 0) {
    const rate = Math.round(report.linesRead / (report.durations.totalMs / 1000))
    lines.push(`  Taxa    ${n(rate)} linhas/s`)
  }

  lines.push(
    totalsMatch(report)
      ? '  Conferência das contagens: ok'
      : '  Conferência das contagens: FALHOU — os números não somam',
  )
  lines.push('────────────────────────────────────────────────────')
  lines.push('')

  return lines.join('\n')
}
