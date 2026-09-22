import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Pool } from 'pg'
import { from as copyFrom } from 'pg-copy-streams'
import { firstOrThrow } from '../../lib/rows.js'
import type { ParsedUser } from './parse.js'

/**
 * Tabela de rascunho da importação (TASK-IMPORT-02).
 *
 * `UNLOGGED` porque o conteúdo é descartável: pular a escrita no WAL acelera
 * bastante a carga, e perder a staging num crash é irrelevante — basta rodar a
 * importação de novo.
 *
 * Sem restrições nem índices de propósito. A tabela recebe as 10 milhões de
 * linhas brutas, duplicatas incluídas; validar unicidade aqui faria o banco
 * rejeitar 84% das linhas uma a uma, que é justamente o custo que o `COPY`
 * existe para evitar. A deduplicação acontece depois, em uma única consulta.
 *
 * Não é criada por migration: é artefato efêmero do script, não parte do
 * schema da aplicação.
 */
export const STAGING_TABLE = 'users_import_staging'

const CREATE_STAGING = `
  CREATE UNLOGGED TABLE IF NOT EXISTS ${STAGING_TABLE} (
    line_no bigint NOT NULL,
    id      uuid   NOT NULL,
    name    text   NOT NULL,
    email   text   NOT NULL,
    phone   text
  )
`

export async function createStagingTable(pool: Pool): Promise<void> {
  await pool.query(CREATE_STAGING)
  // TRUNCATE em vez de DELETE: a tabela pode ter sobrado de uma execução
  // interrompida, e reaproveitar o conteúdo antigo corromperia a contagem.
  await pool.query(`TRUNCATE TABLE ${STAGING_TABLE}`)
}

export async function dropStagingTable(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS ${STAGING_TABLE}`)
}

/**
 * Escapa um valor para o formato texto do `COPY`.
 *
 * O formato usa tabulação como separador e barra invertida como escape, então
 * esses caracteres precisam ser neutralizados. Sem isso, um nome contendo
 * tabulação deslocaria todas as colunas seguintes daquela linha — corrupção
 * silenciosa, não erro.
 *
 * `\N` é como o `COPY` representa NULL; uma string literal "\N" no dado viraria
 * nulo sem o escape da barra.
 */
export function escapeCopyValue(value: string | null): string {
  if (value === null) return '\\N'

  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

export function toCopyLine(user: ParsedUser): string {
  return [
    String(user.lineNumber),
    user.id,
    escapeCopyValue(user.name),
    escapeCopyValue(user.email),
    escapeCopyValue(user.phone),
  ].join('\t')
}

async function* toCopyLines(users: AsyncIterable<ParsedUser>): AsyncGenerator<string> {
  for await (const user of users) {
    yield `${toCopyLine(user)}\n`
  }
}

/**
 * Envia os registros válidos para a staging via `COPY ... FROM STDIN`.
 *
 * `pipeline` liga o gerador do parser ao fluxo do `COPY` e cuida da
 * contrapressão: se o banco ficar para trás, a leitura do arquivo desacelera
 * junto, em vez de acumular linhas na memória do processo.
 *
 * Usa um cliente dedicado do pool, e não o Drizzle, porque `COPY` é um
 * protocolo próprio do PostgreSQL que não passa por consulta comum.
 */
export async function copyUsersToStaging(
  pool: Pool,
  users: AsyncIterable<ParsedUser>,
): Promise<void> {
  const client = await pool.connect()

  try {
    const target = client.query(
      copyFrom(`COPY ${STAGING_TABLE} (line_no, id, name, email, phone) FROM STDIN`),
    )

    await pipeline(Readable.from(toCopyLines(users)), target)
  } finally {
    client.release()
  }
}

export async function countStagingRows(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM ${STAGING_TABLE}`,
  )

  // `count(*)` sempre devolve uma linha; ausência aqui seria defeito interno.
  return Number(firstOrThrow(rows, 'count na staging não retornou linha').total)
}
