import type { Pool } from 'pg'
import { firstOrThrow } from '../../lib/rows.js'
import { STAGING_TABLE } from './staging.js'

/**
 * Move os registros da staging para `users`, resolvendo duplicatas de email.
 *
 * `DISTINCT ON (lower(email))` combinado com `ORDER BY lower(email), line_no`
 * é o que implementa a premissa P3: **vence a primeira ocorrência no arquivo**.
 * O `line_no` no `ORDER BY` não é decoração — sem ele, o PostgreSQL escolheria
 * uma linha arbitrária entre as duplicatas, e duas execuções sobre o mesmo
 * arquivo poderiam gravar nomes diferentes para o mesmo email.
 *
 * `lower(email)` no lugar de `email` porque a unicidade não distingue caixa
 * (premissa P4) — precisa ser o mesmo critério do índice único, senão a
 * consulta deixaria passar duas variações que o banco depois rejeitaria.
 *
 * `ON CONFLICT DO NOTHING` sem alvo cobre qualquer restrição, e é o que torna
 * a importação repetível: numa segunda execução, todos os emails já existem e
 * nada é inserido, em vez de a carga inteira falhar no primeiro conflito.
 *
 * Tudo acontece em uma consulta só. A alternativa — trazer 10 milhões de
 * linhas para o processo e deduplicar em JavaScript — exigiria manter 1,6
 * milhão de chaves em memória e seria ordens de grandeza mais lenta.
 */
const MERGE_SQL = `
  INSERT INTO users (id, name, email, phone)
  SELECT DISTINCT ON (lower(email))
         id, name, email, phone
    FROM ${STAGING_TABLE}
   ORDER BY lower(email), line_no
  ON CONFLICT DO NOTHING
`

export interface MergeResult {
  /** Linhas efetivamente gravadas em `users`. */
  inserted: number
  /** Emails distintos presentes na staging. */
  distinctEmails: number
  /** Linhas descartadas por já existir o mesmo email na staging. */
  duplicatesInFile: number
  /** Linhas descartadas por o email já existir em `users` antes da carga. */
  alreadyInDatabase: number
}

/**
 * Executa a deduplicação e devolve os números que fecham o relatório.
 *
 * As contagens são medidas em vez de deduzidas: `duplicatesInFile` vem da
 * diferença entre linhas e emails distintos na staging, e `alreadyInDatabase`
 * da diferença entre emails distintos e linhas efetivamente inseridas. Assim
 * `lidos = importados + duplicados + já existentes` fecha por construção.
 */
export async function mergeStagingIntoUsers(pool: Pool): Promise<MergeResult> {
  const { rows } = await pool.query<{ total: string; distinct_emails: string }>(
    `SELECT count(*)::text AS total,
            count(DISTINCT lower(email))::text AS distinct_emails
       FROM ${STAGING_TABLE}`,
  )

  // `count(*)` sempre devolve uma linha; ausência aqui seria defeito interno.
  const counts = firstOrThrow(rows, 'contagem da staging não retornou linha')
  const staged = Number(counts.total)
  const distinctEmails = Number(counts.distinct_emails)

  const result = await pool.query(MERGE_SQL)

  // `rowCount` é nulo apenas em comandos que não afetam linhas; um INSERT
  // sempre o preenche. Tratar como zero mascararia um INSERT que não rodou.
  if (result.rowCount === null) throw new Error('INSERT de deduplicação não reportou linhas')

  const inserted = result.rowCount

  return {
    inserted,
    distinctEmails,
    duplicatesInFile: staged - distinctEmails,
    alreadyInDatabase: distinctEmails - inserted,
  }
}
