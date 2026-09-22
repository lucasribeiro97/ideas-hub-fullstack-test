import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  InvalidHeaderError,
  createImportStats,
  streamValidUsers,
  type ImportStats,
  type ParsedUser,
} from '../src/scripts/import/parse.js'

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))
const VALID_CSV = join(FIXTURES, 'users-valid.csv')
const BROKEN_CSV = join(FIXTURES, 'users-defeituoso.csv')

let tempDir: string

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'import-parse-'))
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

/** Escreve um CSV temporário e devolve o caminho. */
async function writeCsv(name: string, content: string): Promise<string> {
  const path = join(tempDir, name)
  await writeFile(path, content, 'utf8')

  return path
}

async function collect(
  filePath: string,
  options: { limit?: number; maxSamples?: number } = {},
): Promise<{ users: ParsedUser[]; stats: ImportStats }> {
  const stats = createImportStats()
  const users: ParsedUser[] = []

  for await (const user of streamValidUsers(filePath, { stats, ...options })) {
    users.push(user)
  }

  return { users, stats }
}

describe('arquivo íntegro', () => {
  it('lê todos os registros', async () => {
    const { users, stats } = await collect(VALID_CSV)

    expect(users).toHaveLength(3)
    expect(stats).toMatchObject({ linesRead: 3, valid: 3, rejected: 0 })
  })

  it('numera as linhas a partir de 1, desconsiderando o cabeçalho', async () => {
    const { users } = await collect(VALID_CSV)

    expect(users.map((u) => u.lineNumber)).toEqual([1, 2, 3])
  })

  it('preserva acentuação', async () => {
    const { users } = await collect(VALID_CSV)

    expect(users[2]?.name).toBe('Sr. Hélio Xavier')
  })

  it('preserva a caixa original do email', async () => {
    const { users } = await collect(VALID_CSV)

    expect(users[0]?.email).toBe('Yuri_Pereira5@bol.com.br')
  })

  it('mantém o telefone quando presente', async () => {
    const { users } = await collect(VALID_CSV)

    expect(users[0]?.phone).toBe('(56) 15898-9862')
  })
})

/*
 * O dataset real está estruturalmente íntegro (SPEC §3), então nenhum destes
 * caminhos é exercitado por ele. São cobertos aqui, com defeitos propositais,
 * para que a robustez seja verificada em vez de suposta.
 */
describe('registros inválidos são rejeitados com motivo e linha', () => {
  it('conta lidos, válidos e rejeitados de forma que os números fechem', async () => {
    const { stats } = await collect(BROKEN_CSV)

    expect(stats.linesRead).toBe(11)
    expect(stats.valid + stats.rejected).toBe(stats.linesRead - 1) // a linha 10 está em branco
  })

  it('aceita apenas os registros realmente válidos', async () => {
    const { users } = await collect(BROKEN_CSV)

    expect(users.map((u) => u.name)).toEqual(['Valido Um', 'Valido Dois', 'Valido Tres'])
  })

  it.each([
    [2, 'id não é um UUID válido'],
    [3, 'nome vazio'],
    [4, 'email vazio'],
    [5, 'email em formato inválido'],
  ])('rejeita a linha %i por %s', async (lineNumber, reason) => {
    const { stats } = await collect(BROKEN_CSV)
    const rejection = stats.samples.find((sample) => sample.lineNumber === lineNumber)

    expect(rejection?.reason).toBe(reason)
  })

  it('rejeita linha com campos a menos', async () => {
    const { stats } = await collect(BROKEN_CSV)
    const rejection = stats.samples.find((sample) => sample.lineNumber === 6)

    expect(rejection?.reason).toContain('esperados 4 campos, encontrados 3')
  })

  it('rejeita linha com campos a mais', async () => {
    const { stats } = await collect(BROKEN_CSV)
    const rejection = stats.samples.find((sample) => sample.lineNumber === 7)

    expect(rejection?.reason).toContain('encontrados 5')
  })

  // A divisão por vírgula não interpreta aspas. A linha é rejeitada com motivo
  // explícito em vez de ser interpretada pela metade.
  it('rejeita linha com aspas em vez de interpretá-la parcialmente', async () => {
    const { stats } = await collect(BROKEN_CSV)
    const rejection = stats.samples.find((sample) => sample.lineNumber === 9)

    expect(rejection?.reason).toContain('aspas')
  })

  it('ignora linha em branco sem contá-la como rejeitada', async () => {
    const { stats } = await collect(BROKEN_CSV)

    expect(stats.samples.map((s) => s.lineNumber)).not.toContain(10)
  })

  it('trata telefone vazio como ausência', async () => {
    const { users } = await collect(BROKEN_CSV)

    expect(users.find((u) => u.name === 'Valido Dois')?.phone).toBeNull()
  })

  it('agrupa as rejeições por motivo', async () => {
    const { stats } = await collect(BROKEN_CSV)

    expect(stats.rejectionsByReason['nome vazio']).toBe(1)
    expect(Object.values(stats.rejectionsByReason).reduce((a, b) => a + b, 0)).toBe(stats.rejected)
  })

  it('inclui um trecho da linha original para diagnóstico', async () => {
    const { stats } = await collect(BROKEN_CSV)
    const rejection = stats.samples.find((sample) => sample.lineNumber === 2)

    expect(rejection?.excerpt).toContain('nao-e-uuid')
  })
})

describe('limites de campo iguais aos da API', () => {
  it('rejeita nome acima de 120 caracteres', async () => {
    const path = await writeCsv(
      'nome-longo.csv',
      `id,name,email,phone\n63f1ea59-25ad-41ab-8437-b8c00bed9031,${'a'.repeat(121)},x@y.com,\n`,
    )

    const { stats } = await collect(path)

    expect(stats.samples[0]?.reason).toContain('nome acima de 120')
  })

  it('rejeita telefone acima de 30 caracteres', async () => {
    const path = await writeCsv(
      'telefone-longo.csv',
      `id,name,email,phone\n63f1ea59-25ad-41ab-8437-b8c00bed9031,Nome,x@y.com,${'9'.repeat(31)}\n`,
    )

    const { stats } = await collect(path)

    expect(stats.samples[0]?.reason).toContain('telefone acima de 30')
  })

  it('rejeita email acima de 254 caracteres', async () => {
    const longo = `${'a'.repeat(250)}@y.com`
    const path = await writeCsv(
      'email-longo.csv',
      `id,name,email,phone\n63f1ea59-25ad-41ab-8437-b8c00bed9031,Nome,${longo},\n`,
    )

    const { stats } = await collect(path)

    expect(stats.samples[0]?.reason).toContain('email acima de 254')
  })
})

describe('cabeçalho', () => {
  it('falha imediatamente quando as colunas não são as esperadas', async () => {
    const path = await writeCsv('cabecalho-errado.csv', 'nome,email\nAna,ana@exemplo.com\n')

    await expect(collect(path)).rejects.toBeInstanceOf(InvalidHeaderError)
  })

  it('a mensagem mostra o esperado e o encontrado', async () => {
    const path = await writeCsv('cabecalho-trocado.csv', 'id,email,name,phone\n')

    await expect(collect(path)).rejects.toThrow(/Esperado "id,name,email,phone"/)
  })

  it('arquivo apenas com cabeçalho não produz registros nem erro', async () => {
    const path = await writeCsv('so-cabecalho.csv', 'id,name,email,phone\n')

    const { users, stats } = await collect(path)

    expect(users).toEqual([])
    expect(stats.linesRead).toBe(0)
  })
})

describe('limite de linhas', () => {
  it('processa apenas a quantidade pedida', async () => {
    const { users, stats } = await collect(VALID_CSV, { limit: 2 })

    expect(users).toHaveLength(2)
    expect(stats.linesRead).toBe(2)
  })

  it('limite zero processa o arquivo inteiro', async () => {
    const { users } = await collect(VALID_CSV, { limit: 0 })

    expect(users).toHaveLength(3)
  })

  it('limite maior que o arquivo não causa erro', async () => {
    const { users } = await collect(VALID_CSV, { limit: 9_999 })

    expect(users).toHaveLength(3)
  })
})

describe('amostras de rejeição', () => {
  it('conta todas as rejeições, mas guarda apenas as primeiras', async () => {
    const linhas = Array.from(
      { length: 50 },
      (_unused, index) => `nao-e-uuid-${index},Nome,x@y.com,`,
    ).join('\n')
    const path = await writeCsv('muitas-rejeicoes.csv', `id,name,email,phone\n${linhas}\n`)

    const { stats } = await collect(path, { maxSamples: 5 })

    expect(stats.rejected).toBe(50)
    expect(stats.samples).toHaveLength(5)
  })
})

describe('consumo interrompido', () => {
  // Quem consome pode parar no meio — por erro no banco, por exemplo. O
  // descritor de arquivo precisa ser liberado mesmo assim.
  it('encerra a leitura sem vazar o descritor de arquivo', async () => {
    const stats = createImportStats()
    const generator = streamValidUsers(VALID_CSV, { stats })

    await generator.next()
    await generator.return(undefined)

    expect(stats.valid).toBe(1)
  })
})
