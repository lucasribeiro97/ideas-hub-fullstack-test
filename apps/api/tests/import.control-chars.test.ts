import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearUsers, connectTestDatabase } from './helpers/database.js'
import { runImport } from '../src/scripts/import/run.js'

/*
 * Uma linha defeituosa não pode derrubar a importação inteira.
 *
 * O `parse.ts` promete, por escrito, que "uma linha é rejeitada com motivo,
 * nunca interpretada pela metade. O pior caso é perder a linha e vê-la no
 * relatório". O byte NUL furava essa promessa: `escapeCopyValue` neutraliza
 * barra invertida, quebra de linha e tabulação, mas não `\u0000`, e o
 * `validate` o deixava passar porque NUL não é espaço em branco — sobrevive ao
 * `trim()` e ao padrão de email.
 *
 * O byte chegava ao `COPY`, e o Postgres recusa a operação inteira: 35 minutos
 * de trabalho descartados por um byte, com a mensagem do driver sem número de
 * linha, sem trecho e sem caminho de recuperação. Num arquivo de 10 milhões de
 * linhas não há como descobrir qual remover.
 *
 * Encontrado por revisão. A correção é rejeitar caracteres de controle na
 * validação, para que a linha caia no mesmo relatório das demais rejeições.
 */

const { db, pool } = connectTestDatabase()

let tempDir: string

const HEADER = 'id,name,email,phone'
const VALID = '11111111-0000-4000-8000-000000000001,Ana Souza,ana@exemplo.com,'

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'import-control-'))
})

beforeEach(async () => {
  await clearUsers(db)
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
  await pool.end()
})

async function importLines(name: string, lines: string[]) {
  const filePath = join(tempDir, name)
  await writeFile(filePath, [HEADER, ...lines].join('\n'), 'utf8')

  return runImport(pool, { filePath, limit: 0 })
}

async function storedNames(): Promise<string[]> {
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM users ORDER BY name')

  return rows.map((row) => row.name)
}

describe('caractere de controle no arquivo', () => {
  it('a linha com byte NUL é rejeitada, e as demais são importadas', async () => {
    const withNul = `22222222-0000-4000-8000-000000000002,Bru\u0000no,bruno@exemplo.com,`

    const report = await importLines('nul.csv', [withNul, VALID])

    // O desfecho que importa: a importação termina. Antes ela lançava
    // `invalid byte sequence for encoding "UTF8": 0x00` e nada era gravado,
    // nem a linha boa.
    expect(report.rejected).toBe(1)
    expect(report.inserted).toBe(1)
    expect(await storedNames()).toEqual(['Ana Souza'])
  })

  it('o motivo da rejeição identifica a linha e a causa', async () => {
    const withNul = `22222222-0000-4000-8000-000000000002,Bru\u0000no,bruno@exemplo.com,`

    const report = await importLines('nul-motivo.csv', [withNul])

    const sample = report.rejectionSamples[0]
    // A numeração conta a partir da primeira linha de dados, não do arquivo.
    expect(sample?.lineNumber).toBe(1)
    expect(sample?.reason).toMatch(/controle/i)
  })

  it.each([
    ['no nome', `33333333-0000-4000-8000-000000000003,No\u0000me,c@exemplo.com,`],
    ['no email', `44444444-0000-4000-8000-000000000004,Nome,d\u0000@exemplo.com,`],
    ['no telefone', `55555555-0000-4000-8000-000000000005,Nome,e@exemplo.com,11\u000099`],
  ])('rejeita o byte NUL %s', async (label, line) => {
    const report = await importLines(`nul-${label.replace(/\s/g, '-')}.csv`, [line])

    expect(report.rejected).toBe(1)
    expect(report.inserted).toBe(0)
  })

  it('as contagens continuam fechando', async () => {
    const report = await importLines('nul-contagem.csv', [
      `66666666-0000-4000-8000-000000000006,X\u0000Y,f@exemplo.com,`,
      VALID,
      '',
    ])

    const accounted =
      report.inserted +
      report.duplicatesInFile +
      report.alreadyInDatabase +
      report.rejected +
      report.blankLines

    expect(accounted).toBe(report.linesRead)
  })

  it('caracteres imprimíveis incomuns continuam passando', async () => {
    // A rejeição precisa mirar o que quebra o `COPY`, não qualquer coisa fora
    // do ASCII. Acentuação, emoji e ideogramas são dados legítimos.
    const report = await importLines('unicode.csv', [
      `77777777-0000-4000-8000-000000000007,José Ñuñez 中文 🙂,jose@exemplo.com,`,
    ])

    expect(report.inserted).toBe(1)
    expect(await storedNames()).toEqual(['José Ñuñez 中文 🙂'])
  })
})
