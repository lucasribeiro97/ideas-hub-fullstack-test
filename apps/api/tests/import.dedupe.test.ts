import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import { clearUsers, connectTestDatabase } from './helpers/database.js'
import type { ParsedUser } from '../src/scripts/import/parse.js'
import { mergeStagingIntoUsers } from '../src/scripts/import/dedupe.js'
import {
  copyUsersToStaging,
  createStagingTable,
  dropStagingTable,
} from '../src/scripts/import/staging.js'

const { db, pool } = connectTestDatabase()

beforeEach(async () => {
  await clearUsers(db)
  await createStagingTable(pool)
})

afterAll(async () => {
  await dropStagingTable(pool)
  await pool.end()
})

let uuidCounter = 0
function nextUuid(): string {
  uuidCounter += 1

  return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`
}

function user(lineNumber: number, email: string, name: string, phone: string | null = null): ParsedUser {
  return { lineNumber, id: nextUuid(), name, email, phone }
}

async function stage(users: ParsedUser[]): Promise<void> {
  await copyUsersToStaging(
    pool,
    (async function* () {
      for (const u of users) yield u
    })(),
  )
}

interface StoredUser {
  name: string
  email: string
  phone: string | null
}

async function readUsers(): Promise<StoredUser[]> {
  const { rows } = await pool.query<StoredUser>('SELECT name, email, phone FROM users ORDER BY email')

  return rows
}

describe('deduplicação básica', () => {
  it('insere registros sem duplicata', async () => {
    await stage([
      user(1, 'ana@exemplo.com', 'Ana Souza'),
      user(2, 'bruno@exemplo.com', 'Bruno Lima'),
    ])

    const result = await mergeStagingIntoUsers(pool)

    expect(result.inserted).toBe(2)
    expect(result.duplicatesInFile).toBe(0)
    expect(await readUsers()).toHaveLength(2)
  })

  it('preserva o id vindo do arquivo', async () => {
    const original = user(1, 'ana@exemplo.com', 'Ana Souza')
    await stage([original])
    await mergeStagingIntoUsers(pool)

    const { rows } = await pool.query<{ id: string }>('SELECT id::text FROM users')
    expect(rows[0]?.id).toBe(original.id)
  })

  it('preenche created_at e updated_at automaticamente', async () => {
    await stage([user(1, 'ana@exemplo.com', 'Ana Souza')])
    await mergeStagingIntoUsers(pool)

    const { rows } = await pool.query<{ created_at: Date; updated_at: Date }>(
      'SELECT created_at, updated_at FROM users',
    )

    expect(rows[0]?.created_at).toBeInstanceOf(Date)
    expect(rows[0]?.updated_at).toBeInstanceOf(Date)
  })

  it('mantém o telefone quando presente e nulo quando ausente', async () => {
    await stage([
      user(1, 'com@exemplo.com', 'Com Telefone', '(11) 90000-0000'),
      user(2, 'sem@exemplo.com', 'Sem Telefone', null),
    ])
    await mergeStagingIntoUsers(pool)

    const stored = await readUsers()
    expect(stored.find((u) => u.email === 'com@exemplo.com')?.phone).toBe('(11) 90000-0000')
    expect(stored.find((u) => u.email === 'sem@exemplo.com')?.phone).toBeNull()
  })
})

/*
 * O comportamento central da premissa P3. As duplicatas do arquivo real têm
 * nomes e ids diferentes entre si, então "qual vence" muda o dado gravado —
 * não é detalhe interno.
 */
describe('vence a primeira ocorrência no arquivo', () => {
  it('grava o nome da linha de menor número', async () => {
    await stage([
      user(10, 'repetido@exemplo.com', 'Primeira Ocorrencia'),
      user(20, 'repetido@exemplo.com', 'Segunda Ocorrencia'),
      user(30, 'repetido@exemplo.com', 'Terceira Ocorrencia'),
    ])

    await mergeStagingIntoUsers(pool)

    const stored = await readUsers()
    expect(stored).toHaveLength(1)
    expect(stored[0]?.name).toBe('Primeira Ocorrencia')
  })

  // A ordem física na staging não é garantida pelo PostgreSQL. O critério
  // precisa vir do line_no, e não da ordem de chegada das linhas.
  it('não depende da ordem em que as linhas foram inseridas na staging', async () => {
    await stage([
      user(30, 'repetido@exemplo.com', 'Terceira Ocorrencia'),
      user(10, 'repetido@exemplo.com', 'Primeira Ocorrencia'),
      user(20, 'repetido@exemplo.com', 'Segunda Ocorrencia'),
    ])

    await mergeStagingIntoUsers(pool)

    expect((await readUsers())[0]?.name).toBe('Primeira Ocorrencia')
  })

  it('trata como duplicata o email que difere apenas na caixa', async () => {
    await stage([
      user(1, 'Ana@Exemplo.com', 'Primeira'),
      user(2, 'ana@exemplo.com', 'Segunda'),
      user(3, 'ANA@EXEMPLO.COM', 'Terceira'),
    ])

    const result = await mergeStagingIntoUsers(pool)

    expect(result.inserted).toBe(1)
    expect(result.duplicatesInFile).toBe(2)
  })

  it('preserva a caixa original do email vencedor', async () => {
    await stage([
      user(1, 'Ana.Souza@Exemplo.com', 'Primeira'),
      user(2, 'ana.souza@exemplo.com', 'Segunda'),
    ])

    await mergeStagingIntoUsers(pool)

    expect((await readUsers())[0]?.email).toBe('Ana.Souza@Exemplo.com')
  })

  it('deduplica cada email de forma independente', async () => {
    await stage([
      user(1, 'a@exemplo.com', 'A1'),
      user(2, 'b@exemplo.com', 'B1'),
      user(3, 'a@exemplo.com', 'A2'),
      user(4, 'b@exemplo.com', 'B2'),
      user(5, 'c@exemplo.com', 'C1'),
    ])

    const result = await mergeStagingIntoUsers(pool)
    const stored = await readUsers()

    expect(result.inserted).toBe(3)
    expect(stored.map((u) => u.name)).toEqual(['A1', 'B1', 'C1'])
  })
})

/*
 * Critério S2: duas execuções sobre o mesmo arquivo produzem exatamente o
 * mesmo conjunto de usuários.
 */
describe('reprodutibilidade', () => {
  const input = [
    user(1, 'ana@exemplo.com', 'Ana Souza'),
    user(2, 'bruno@exemplo.com', 'Bruno Lima'),
    user(3, 'ana@exemplo.com', 'Ana Duplicada'),
  ]

  it('a segunda execução não insere nem altera nada', async () => {
    await stage(input)
    const first = await mergeStagingIntoUsers(pool)
    const afterFirstRun = await readUsers()

    await createStagingTable(pool)
    await stage(input)
    const second = await mergeStagingIntoUsers(pool)

    expect(first.inserted).toBe(2)
    expect(second.inserted).toBe(0)
    expect(second.alreadyInDatabase).toBe(2)
    expect(await readUsers()).toEqual(afterFirstRun)
  })

  it('a segunda execução não falha por violação de unicidade', async () => {
    await stage(input)
    await mergeStagingIntoUsers(pool)

    await createStagingTable(pool)
    await stage(input)

    await expect(mergeStagingIntoUsers(pool)).resolves.toBeDefined()
  })

  it('não duplica quando o email já existe com outra caixa', async () => {
    await stage([user(1, 'Ana@Exemplo.com', 'Ana Souza')])
    await mergeStagingIntoUsers(pool)

    await createStagingTable(pool)
    await stage([user(2, 'ana@exemplo.com', 'Ana Outra')])
    const result = await mergeStagingIntoUsers(pool)

    expect(result.inserted).toBe(0)
    expect(await readUsers()).toHaveLength(1)
  })

  it('não sobrescreve o registro existente com o dado novo', async () => {
    await stage([user(1, 'ana@exemplo.com', 'Nome Original')])
    await mergeStagingIntoUsers(pool)

    await createStagingTable(pool)
    await stage([user(2, 'ana@exemplo.com', 'Nome Novo')])
    await mergeStagingIntoUsers(pool)

    expect((await readUsers())[0]?.name).toBe('Nome Original')
  })
})

describe('contagens do relatório', () => {
  it('lidos, importados e duplicados fecham', async () => {
    await stage([
      user(1, 'a@exemplo.com', 'A1'),
      user(2, 'a@exemplo.com', 'A2'),
      user(3, 'a@exemplo.com', 'A3'),
      user(4, 'b@exemplo.com', 'B1'),
      user(5, 'c@exemplo.com', 'C1'),
    ])

    const result = await mergeStagingIntoUsers(pool)

    expect(result.distinctEmails).toBe(3)
    expect(result.inserted + result.duplicatesInFile + result.alreadyInDatabase).toBe(5)
  })

  it('separa duplicata do arquivo de email já existente no banco', async () => {
    await stage([user(1, 'ja-existe@exemplo.com', 'Existente')])
    await mergeStagingIntoUsers(pool)

    await createStagingTable(pool)
    await stage([
      user(2, 'ja-existe@exemplo.com', 'Repetido'),
      user(3, 'novo@exemplo.com', 'Novo'),
      user(4, 'novo@exemplo.com', 'Novo Duplicado'),
    ])

    const result = await mergeStagingIntoUsers(pool)

    expect(result.inserted).toBe(1)
    expect(result.duplicatesInFile).toBe(1)
    expect(result.alreadyInDatabase).toBe(1)
  })

  it('staging vazia não insere nada nem falha', async () => {
    const result = await mergeStagingIntoUsers(pool)

    expect(result).toMatchObject({ inserted: 0, distinctEmails: 0, duplicatesInFile: 0 })
  })
})

/*
 * `rowCount` nulo não acontece num INSERT real — o driver sempre o preenche.
 * Mas tratá-lo como zero mascararia um INSERT que não executou, então o
 * comportamento é verificado com um pool simulado em vez de ficar por suposição.
 */
describe('retorno inesperado do driver', () => {
  function fakePool(rowCount: number | null): Pool {
    return {
      query: (sql: unknown) =>
        typeof sql === 'string' && sql.includes('count(')
          ? Promise.resolve({ rows: [{ total: '0', distinct_emails: '0' }] })
          : Promise.resolve({ rowCount }),
    } as unknown as Pool
  }

  it('falha quando o INSERT não reporta linhas afetadas', async () => {
    await expect(mergeStagingIntoUsers(fakePool(null))).rejects.toThrow(/não reportou linhas/)
  })

  it('aceita zero linhas afetadas, que é resultado legítimo', async () => {
    await expect(mergeStagingIntoUsers(fakePool(0))).resolves.toMatchObject({ inserted: 0 })
  })
})
