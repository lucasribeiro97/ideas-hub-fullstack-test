import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { inject } from 'vitest'
import { clearUsers, connectTestDatabase } from './helpers/database.js'
import { runImport, totalsMatch, type ImportReport } from '../src/scripts/import/run.js'
import { formatReport } from '../src/scripts/import/report.js'
import { STAGING_TABLE } from '../src/scripts/import/staging.js'

const execFileAsync = promisify(execFile)

const { db, pool } = connectTestDatabase()
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))
const VALID_CSV = join(FIXTURES, 'users-valid.csv')
const BROKEN_CSV = join(FIXTURES, 'users-defeituoso.csv')

let tempDir: string

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'import-run-'))
})

beforeEach(async () => {
  await clearUsers(db)
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
  await pool.end()
})

async function countUsers(): Promise<number> {
  const { rows } = await pool.query<{ total: string }>('SELECT count(*)::text AS total FROM users')

  return Number(rows[0]?.total ?? 0)
}

describe('runImport — arquivo íntegro', () => {
  it('importa os registros e devolve o relatório', async () => {
    const report = await runImport(pool, { filePath: VALID_CSV, limit: 0 })

    expect(report.linesRead).toBe(3)
    expect(report.inserted).toBe(3)
    expect(report.rejected).toBe(0)
    expect(await countUsers()).toBe(3)
  })

  it('as contagens fecham', async () => {
    const report = await runImport(pool, { filePath: VALID_CSV, limit: 0 })

    expect(totalsMatch(report)).toBe(true)
  })

  it('respeita o limite de linhas', async () => {
    const report = await runImport(pool, { filePath: VALID_CSV, limit: 2 })

    expect(report.linesRead).toBe(2)
    expect(await countUsers()).toBe(2)
  })

  it('mede os tempos de cada etapa', async () => {
    const report = await runImport(pool, { filePath: VALID_CSV, limit: 0 })

    expect(report.durations.copyMs).toBeGreaterThan(0)
    expect(report.durations.mergeMs).toBeGreaterThan(0)
    expect(report.durations.totalMs).toBeGreaterThanOrEqual(
      report.durations.copyMs + report.durations.mergeMs,
    )
  })
})

describe('runImport — arquivo com defeitos', () => {
  it('as contagens fecham mesmo com rejeições e linha em branco', async () => {
    const report = await runImport(pool, { filePath: BROKEN_CSV, limit: 0 })

    expect(report.linesRead).toBe(11)
    expect(report.inserted).toBe(3)
    expect(report.rejected).toBe(7)
    expect(report.blankLines).toBe(1)
    expect(totalsMatch(report)).toBe(true)
  })

  it('agrupa as rejeições por motivo', async () => {
    const report = await runImport(pool, { filePath: BROKEN_CSV, limit: 0 })

    expect(Object.keys(report.rejectionsByReason)).toContain('id não é um UUID válido')
  })
})

/*
 * Critério S2: reproduzibilidade. Duas execuções sobre o mesmo arquivo
 * produzem exatamente o mesmo conjunto de usuários.
 */
describe('runImport — reprodutibilidade', () => {
  it('a segunda execução não insere nada novo', async () => {
    const primeira = await runImport(pool, { filePath: VALID_CSV, limit: 0 })
    const segunda = await runImport(pool, { filePath: VALID_CSV, limit: 0 })

    expect(primeira.inserted).toBe(3)
    expect(segunda.inserted).toBe(0)
    expect(segunda.alreadyInDatabase).toBe(3)
    expect(await countUsers()).toBe(3)
  })

  it('o conjunto de usuários é idêntico após a segunda execução', async () => {
    await runImport(pool, { filePath: VALID_CSV, limit: 0 })
    const { rows: depoisDaPrimeira } = await pool.query(
      'SELECT id::text, name, email, phone FROM users ORDER BY email',
    )

    await runImport(pool, { filePath: VALID_CSV, limit: 0 })
    const { rows: depoisDaSegunda } = await pool.query(
      'SELECT id::text, name, email, phone FROM users ORDER BY email',
    )

    expect(depoisDaSegunda).toEqual(depoisDaPrimeira)
  })
})

describe('runImport — limpeza da staging', () => {
  it('remove a tabela de rascunho ao final', async () => {
    await runImport(pool, { filePath: VALID_CSV, limit: 0 })

    const { rows } = await pool.query<{ existe: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = $1) AS existe',
      [STAGING_TABLE],
    )

    expect(rows[0]?.existe).toBe(false)
  })

  // Deixar a staging para trás ocuparia disco e faria a execução seguinte
  // começar com dados de uma carga interrompida.
  it('remove a staging mesmo quando a importação falha', async () => {
    await expect(
      runImport(pool, { filePath: join(tempDir, 'nao-existe.csv'), limit: 0 }),
    ).rejects.toThrow()

    const { rows } = await pool.query<{ existe: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = $1) AS existe',
      [STAGING_TABLE],
    )

    expect(rows[0]?.existe).toBe(false)
  })

  it('cabeçalho inválido interrompe sem gravar nada', async () => {
    const path = join(tempDir, 'cabecalho-errado.csv')
    await writeFile(path, 'nome,email\nAna,ana@x.com\n', 'utf8')

    await expect(runImport(pool, { filePath: path, limit: 0 })).rejects.toThrow(/Cabeçalho/)
    expect(await countUsers()).toBe(0)
  })
})

describe('formatReport', () => {
  const base: ImportReport = {
    linesRead: 100,
    valid: 90,
    rejected: 10,
    blankLines: 0,
    rejectionsByReason: { 'nome vazio': 7, 'email vazio': 3 },
    rejectionSamples: [{ lineNumber: 4, reason: 'nome vazio', excerpt: 'id,,email,' }],
    inserted: 60,
    duplicatesInFile: 30,
    alreadyInDatabase: 0,
    durations: { copyMs: 1200, mergeMs: 800, totalMs: 2100 },
  }

  it('mostra todas as categorias do relatório', () => {
    const saida = formatReport(base)

    expect(saida).toContain('Linhas lidas')
    expect(saida).toContain('Importados')
    expect(saida).toContain('Duplicados no arquivo')
    expect(saida).toContain('Já existentes no banco')
    expect(saida).toContain('Rejeitados')
  })

  it('lista os motivos das rejeições do mais frequente ao menos', () => {
    const saida = formatReport(base)
    const posicaoNome = saida.indexOf('nome vazio')
    const posicaoEmail = saida.indexOf('email vazio')

    expect(posicaoNome).toBeLessThan(posicaoEmail)
  })

  it('mostra o trecho da linha rejeitada para diagnóstico', () => {
    expect(formatReport(base)).toContain('id,,email,')
  })

  it('omite a seção de rejeições quando não há nenhuma', () => {
    const saida = formatReport({ ...base, rejected: 0, rejectionsByReason: {}, rejectionSamples: [] })

    expect(saida).not.toContain('Motivos das rejeições')
  })

  it('mostra as linhas em branco apenas quando existem', () => {
    expect(formatReport(base)).not.toContain('Linhas em branco')
    expect(formatReport({ ...base, blankLines: 2 })).toContain('Linhas em branco')
  })

  it('avisa quando as contagens não fecham', () => {
    // Um relatório cujos números não somam é pior que nenhum relatório: passa
    // a impressão de que a importação foi auditada quando não foi.
    expect(formatReport({ ...base, inserted: 1 })).toContain('FALHOU')
    expect(formatReport(base)).toContain('Conferência das contagens: ok')
  })

  it('não quebra com relatório zerado', () => {
    const vazio: ImportReport = {
      ...base,
      linesRead: 0,
      valid: 0,
      rejected: 0,
      inserted: 0,
      duplicatesInFile: 0,
      rejectionsByReason: {},
      rejectionSamples: [],
      durations: { copyMs: 0, mergeMs: 0, totalMs: 0 },
    }

    expect(() => formatReport(vazio)).not.toThrow()
  })
})

/*
 * O comando executado como processo real. É o que verifica o encanamento que
 * nenhum teste de unidade alcança: leitura de argumentos, conexão, saída no
 * terminal e código de retorno.
 */
describe('comando npm run import', () => {
  const CLI = fileURLToPath(new URL('../src/scripts/import-users.ts', import.meta.url))

  async function runCli(
    args: string[],
    env: Record<string, string> = {},
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execFileAsync('npx', ['tsx', CLI, ...args], {
        env: { ...process.env, DATABASE_URL: inject('databaseUrl'), ...env },
      })

      return { code: 0, stdout, stderr }
    } catch (error) {
      const failure = error as { code?: number; stdout?: string; stderr?: string }

      return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' }
    }
  }

  it('importa e imprime o relatório, saindo com código 0', async () => {
    const { code, stdout } = await runCli([`--file=${VALID_CSV}`, '--limit=0'])

    expect(code).toBe(0)
    expect(stdout).toContain('Importação concluída')
    expect(stdout).toContain('Conferência das contagens: ok')
    expect(await countUsers()).toBe(3)
  }, 60_000)

  it('--help sai com código 0 sem tocar no banco', async () => {
    const { code, stdout } = await runCli(['--help'])

    expect(code).toBe(0)
    expect(stdout).toContain('Importa os usuários')
    expect(await countUsers()).toBe(0)
  }, 60_000)

  it('arquivo inexistente sai com código 2 e instrui a extrair o .tgz', async () => {
    const { code, stderr } = await runCli(['--file=/tmp/nao-existe-mesmo.csv'])

    expect(code).toBe(2)
    expect(stderr).toContain('tar -xzf')
  }, 60_000)

  it('opção desconhecida sai com código 2', async () => {
    const { code, stderr } = await runCli(['--turbo'])

    expect(code).toBe(2)
    expect(stderr).toContain('Opção desconhecida')
  }, 60_000)

  it('sem DATABASE_URL sai com código 2 apontando o .env.example', async () => {
    const { code, stderr } = await runCli([`--file=${VALID_CSV}`], { DATABASE_URL: '' })

    expect(code).toBe(2)
    expect(stderr).toContain('.env.example')
  }, 60_000)
})
