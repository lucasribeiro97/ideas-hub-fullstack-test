import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearUsers, connectTestDatabase } from './helpers/database.js'
import { runImport } from '../src/scripts/import/run.js'
import { ImportAlreadyRunningError } from '../src/scripts/import/lock.js'

/*
 * Duas importações simultâneas não podem existir.
 *
 * A tabela de rascunho tem nome fixo e global. Sem exclusão mútua, duas
 * execuções contra o mesmo banco compartilham a mesma tabela: o `TRUNCATE` de
 * uma apaga o que a outra já copiou, e o `DROP` do `finally` de uma derruba a
 * tabela sob os pés da outra. A execução lesada faz o merge sobre dados alheios
 * e relata esses números como se fossem os seus.
 *
 * A conferência das contagens não salva: quando os totais dos dois arquivos
 * coincidem, ela fecha e o processo sai com código 0. Encontrado por revisão,
 * que reproduziu os dois desfechos pela linha de comando — uma execução
 * relatando "Importados 6 / Conferência: ok" com nenhum dos seus seis registros
 * no banco, e outra morrendo com `relation "users_import_staging" does not
 * exist`.
 *
 * A escolha é recusar a segunda execução, não enfileirá-la: quem dispara duas
 * importações de 35 minutos quase sempre fez isso por engano, e esperar em
 * silêncio esconderia o engano em vez de mostrá-lo.
 */

const { db, pool } = connectTestDatabase()

let tempDir: string
let fileA: string
let fileB: string

/**
 * Linhas com emails de domínios distintos, para saber de qual arquivo vieram.
 *
 * O `prefix` também separa os identificadores. Com ids repetidos entre os dois
 * arquivos, a segunda importação não insere nada — o `ON CONFLICT DO NOTHING`
 * do merge cobre a chave primária, não só o email — e o teste mediria isso em
 * vez do lock.
 */
function csv(domain: string, prefix: string, count: number): string {
  const header = 'id,name,email,phone'
  const rows = Array.from({ length: count }, (_, index) => {
    const uuid = `${prefix}-0000-4000-8000-${String(index).padStart(12, '0')}`

    return `${uuid},Pessoa ${index},pessoa${index}@${domain},`
  })

  return [header, ...rows].join('\n')
}

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'import-concurrency-'))
  fileA = join(tempDir, 'a.csv')
  fileB = join(tempDir, 'b.csv')
  await writeFile(fileA, csv('a.example', 'aaaaaaaa', 6), 'utf8')
  await writeFile(fileB, csv('b.example', 'bbbbbbbb', 6), 'utf8')
})

beforeEach(async () => {
  await clearUsers(db)
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
  await pool.end()
})

type Outcome = { report?: Awaited<ReturnType<typeof runImport>>; error?: unknown }

/**
 * Dispara as duas importações e devolve o desfecho de cada uma.
 *
 * O tratador de rejeição declara `unknown` de propósito: `PromiseSettledResult`
 * tipa `reason` como `any`, e ler dali espalharia `any` pelo teste.
 */
function runBoth(): Promise<Outcome[]> {
  const run = (filePath: string): Promise<Outcome> =>
    runImport(pool, { filePath, limit: 0 }).then(
      (report) => ({ report }),
      (error: unknown) => ({ error }),
    )

  return Promise.all([run(fileA), run(fileB)])
}

async function emailDomains(): Promise<string[]> {
  const { rows } = await pool.query<{ domain: string }>(
    `SELECT DISTINCT split_part(email, '@', 2) AS domain FROM users ORDER BY 1`,
  )

  return rows.map((row) => row.domain)
}

describe('duas importações ao mesmo tempo', () => {
  it('a segunda é recusada em vez de corromper a primeira', async () => {
    const outcomes = await runBoth()

    const reasons = outcomes.filter((outcome) => outcome.error !== undefined)

    expect(outcomes.filter((outcome) => outcome.report !== undefined)).toHaveLength(1)
    expect(reasons).toHaveLength(1)

    // A recusa precisa ser reconhecível, e não um erro de SQL sobre uma tabela
    // que sumiu: quem executa tem que saber que a causa é outra execução.
    expect(reasons[0]?.error).toBeInstanceOf(ImportAlreadyRunningError)
  })

  it('o banco recebe as linhas de um arquivo só, e o relatório descreve esse arquivo', async () => {
    const outcomes = await runBoth()
    const report = outcomes.find((outcome) => outcome.report !== undefined)?.report

    // O defeito original não era perder linhas: era relatar as linhas de um
    // arquivo tendo gravado as do outro.
    const domains = await emailDomains()
    expect(domains).toHaveLength(1)
    expect(report?.inserted).toBe(6)
  })

  it('uma execução sequencial seguinte funciona normalmente', async () => {
    await runImport(pool, { filePath: fileA, limit: 0 })

    // O lock precisa ser devolvido ao fim de cada execução, inclusive quando
    // outra foi recusada; senão a primeira corrida deixaria o banco travado
    // para sempre.
    const report = await runImport(pool, { filePath: fileB, limit: 0 })

    expect(report.inserted).toBe(6)
    expect(await emailDomains()).toEqual(['a.example', 'b.example'])
  })

  it('o lock é devolvido mesmo quando a importação falha', async () => {
    await expect(
      runImport(pool, { filePath: join(tempDir, 'inexistente.csv'), limit: 0 }),
    ).rejects.toThrow()

    const report = await runImport(pool, { filePath: fileA, limit: 0 })

    expect(report.inserted).toBe(6)
  })
})
