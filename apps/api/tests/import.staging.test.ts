import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { connectTestDatabase } from './helpers/database.js'
import type { ParsedUser } from '../src/scripts/import/parse.js'
import {
  STAGING_TABLE,
  copyUsersToStaging,
  countStagingRows,
  createStagingTable,
  dropStagingTable,
  escapeCopyValue,
  toCopyLine,
} from '../src/scripts/import/staging.js'

const { pool } = connectTestDatabase()

beforeEach(async () => {
  await createStagingTable(pool)
})

afterAll(async () => {
  await dropStagingTable(pool)
  await pool.end()
})

async function* asStream(users: ParsedUser[]): AsyncGenerator<ParsedUser> {
  for (const user of users) yield user
}

function buildUser(overrides: Partial<ParsedUser> & { lineNumber: number }): ParsedUser {
  return {
    id: '63f1ea59-25ad-41ab-8437-b8c00bed9031',
    name: 'Ana Souza',
    email: 'ana@exemplo.com',
    phone: null,
    ...overrides,
  }
}

interface StagedRow {
  line_no: string
  id: string
  name: string
  email: string
  phone: string | null
}

async function readStaging(): Promise<StagedRow[]> {
  const { rows } = await pool.query<StagedRow>(
    `SELECT line_no::text, id::text, name, email, phone FROM ${STAGING_TABLE} ORDER BY line_no`,
  )

  return rows
}

describe('escapeCopyValue', () => {
  it('representa nulo como \\N, que é o marcador do COPY', () => {
    expect(escapeCopyValue(null)).toBe('\\N')
  })

  it('escapa a barra invertida, para que "\\N" literal não vire nulo', () => {
    expect(escapeCopyValue('\\N')).toBe('\\\\N')
  })

  // Sem escapar a tabulação, um nome que a contenha deslocaria todas as
  // colunas seguintes daquela linha — corrupção silenciosa, não erro.
  it('escapa tabulação, que é o separador de campos', () => {
    expect(escapeCopyValue('Ana\tSouza')).toBe('Ana\\tSouza')
  })

  it('escapa quebras de linha, que encerrariam o registro', () => {
    expect(escapeCopyValue('Ana\nSouza')).toBe('Ana\\nSouza')
    expect(escapeCopyValue('Ana\rSouza')).toBe('Ana\\rSouza')
  })

  it('deixa texto comum intacto, inclusive acentuado', () => {
    expect(escapeCopyValue('Sr. Hélio Xavier')).toBe('Sr. Hélio Xavier')
  })
})

describe('toCopyLine', () => {
  it('monta a linha com os campos na ordem da tabela', () => {
    const line = toCopyLine(
      buildUser({ lineNumber: 7, name: 'Bruno Lima', email: 'bruno@x.com', phone: '(11) 9' }),
    )

    expect(line.split('\t')).toEqual([
      '7',
      '63f1ea59-25ad-41ab-8437-b8c00bed9031',
      'Bruno Lima',
      'bruno@x.com',
      '(11) 9',
    ])
  })
})

describe('copyUsersToStaging', () => {
  it('grava todos os registros recebidos', async () => {
    await copyUsersToStaging(
      pool,
      asStream([
        buildUser({ lineNumber: 1, email: 'a@exemplo.com' }),
        buildUser({ lineNumber: 2, email: 'b@exemplo.com' }),
        buildUser({ lineNumber: 3, email: 'c@exemplo.com' }),
      ]),
    )

    expect(await countStagingRows(pool)).toBe(3)
  })

  it('preserva o número de linha, base do desempate da deduplicação', async () => {
    await copyUsersToStaging(
      pool,
      asStream([buildUser({ lineNumber: 42 }), buildUser({ lineNumber: 4_815_162 })]),
    )

    const rows = await readStaging()
    expect(rows.map((row) => row.line_no)).toEqual(['42', '4815162'])
  })

  it('preserva a caixa original do email', async () => {
    await copyUsersToStaging(pool, asStream([buildUser({ lineNumber: 1, email: 'Ana@Exemplo.com' })]))

    expect((await readStaging())[0]?.email).toBe('Ana@Exemplo.com')
  })

  it('preserva acentuação', async () => {
    await copyUsersToStaging(pool, asStream([buildUser({ lineNumber: 1, name: 'Sr. Hélio Xavier' })]))

    expect((await readStaging())[0]?.name).toBe('Sr. Hélio Xavier')
  })

  it('grava telefone ausente como nulo, e não como texto vazio', async () => {
    await copyUsersToStaging(pool, asStream([buildUser({ lineNumber: 1, phone: null })]))

    expect((await readStaging())[0]?.phone).toBeNull()
  })

  // A staging não tem restrição alguma: é justamente o que permite receber as
  // 10 milhões de linhas brutas sem o banco rejeitar 84% delas uma a uma.
  it('aceita emails repetidos, sem aplicar unicidade', async () => {
    await copyUsersToStaging(
      pool,
      asStream([
        buildUser({ lineNumber: 1, email: 'repetido@exemplo.com', name: 'Primeiro' }),
        buildUser({ lineNumber: 2, email: 'repetido@exemplo.com', name: 'Segundo' }),
        buildUser({ lineNumber: 3, email: 'REPETIDO@EXEMPLO.COM', name: 'Terceiro' }),
      ]),
    )

    expect(await countStagingRows(pool)).toBe(3)
  })

  it('aceita ids repetidos, que a staging também não restringe', async () => {
    await copyUsersToStaging(
      pool,
      asStream([
        buildUser({ lineNumber: 1, email: 'a@exemplo.com' }),
        buildUser({ lineNumber: 2, email: 'b@exemplo.com' }),
      ]),
    )

    expect(await countStagingRows(pool)).toBe(2)
  })

  it('grava corretamente valores com tabulação e barra invertida', async () => {
    await copyUsersToStaging(
      pool,
      asStream([buildUser({ lineNumber: 1, name: 'Ana\tSouza\\Lima' })]),
    )

    expect((await readStaging())[0]?.name).toBe('Ana\tSouza\\Lima')
  })

  it('lida com fluxo vazio sem erro', async () => {
    await copyUsersToStaging(pool, asStream([]))

    expect(await countStagingRows(pool)).toBe(0)
  })
})

describe('ciclo de vida da staging', () => {
  it('createStagingTable esvazia sobras de execução anterior', async () => {
    await copyUsersToStaging(pool, asStream([buildUser({ lineNumber: 1 })]))
    expect(await countStagingRows(pool)).toBe(1)

    await createStagingTable(pool)

    expect(await countStagingRows(pool)).toBe(0)
  })

  it('é criada como UNLOGGED, para pular a escrita no WAL', async () => {
    const { rows } = await pool.query<{ relpersistence: string }>(
      `SELECT relpersistence FROM pg_class WHERE relname = $1`,
      [STAGING_TABLE],
    )

    expect(rows[0]?.relpersistence).toBe('u')
  })

  it('não interfere na tabela users', async () => {
    await copyUsersToStaging(pool, asStream([buildUser({ lineNumber: 1 })]))

    const { rows } = await pool.query<{ total: string }>('SELECT count(*)::text AS total FROM users')

    expect(rows[0]?.total).toBe('0')
  })

  it('dropStagingTable remove a tabela', async () => {
    await dropStagingTable(pool)

    const { rows } = await pool.query<{ existe: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = $1) AS existe`,
      [STAGING_TABLE],
    )

    expect(rows[0]?.existe).toBe(false)
  })
})
