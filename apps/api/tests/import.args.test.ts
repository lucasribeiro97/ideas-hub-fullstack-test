import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILE,
  DEFAULT_LIMIT,
  HELP_TEXT,
  InvalidArgumentError,
  parseArgs,
} from '../src/scripts/import/args.js'

describe('parseArgs — padrões', () => {
  it('sem argumentos usa o arquivo e o limite documentados', () => {
    expect(parseArgs([])).toEqual({ kind: 'run', filePath: DEFAULT_FILE, limit: DEFAULT_LIMIT })
  })

  it('o limite padrão é 500 mil, conforme a premissa P6', () => {
    expect(DEFAULT_LIMIT).toBe(500_000)
  })
})

describe('parseArgs — ajuda', () => {
  it.each([['--help'], ['-h']])('%s pede a ajuda', (flag) => {
    expect(parseArgs([flag])).toEqual({ kind: 'help' })
  })

  it('a ajuda tem prioridade sobre as demais opções', () => {
    expect(parseArgs(['--limit=10', '--help'])).toEqual({ kind: 'help' })
  })

  it('o texto de ajuda menciona a extração do .tgz', () => {
    // Premissa P1: o arquivo não é um .gz simples, e quem executa precisa
    // saber disso antes de tentar a primeira importação.
    expect(HELP_TEXT).toContain('tar -xzf')
  })
})

describe('parseArgs — arquivo', () => {
  it.each([
    [['--file=/tmp/x.csv']],
    [['--file', '/tmp/x.csv']],
  ])('aceita %j', (argv) => {
    expect(parseArgs(argv)).toMatchObject({ filePath: '/tmp/x.csv' })
  })

  it('rejeita --file sem valor', () => {
    expect(() => parseArgs(['--file'])).toThrow(InvalidArgumentError)
  })

  it('rejeita --file seguido de outra opção', () => {
    expect(() => parseArgs(['--file', '--limit=10'])).toThrow(/exige um valor/)
  })

  it('rejeita --file= vazio', () => {
    expect(() => parseArgs(['--file='])).toThrow(InvalidArgumentError)
  })
})

describe('parseArgs — limite', () => {
  it.each([
    [['--limit=1000'], 1000],
    [['--limit', '1000'], 1000],
    [['--limit=0'], 0],
  ])('aceita %j resultando em %i', (argv, expected) => {
    expect(parseArgs(argv)).toMatchObject({ limit: expected })
  })

  it.each([
    ['texto', 'abc'],
    ['negativo', '-5'],
    ['fracionário', '1.5'],
    ['vazio', ''],
  ])('rejeita limite %s', (_case, value) => {
    expect(() => parseArgs([`--limit=${value}`])).toThrow(InvalidArgumentError)
  })

  it('a mensagem de erro mostra o valor recebido', () => {
    expect(() => parseArgs(['--limit=abc'])).toThrow(/Recebido: "abc"/)
  })
})

describe('parseArgs — combinações e erros', () => {
  it('aceita as duas opções juntas', () => {
    expect(parseArgs(['--file=/tmp/a.csv', '--limit=42'])).toEqual({
      kind: 'run',
      filePath: '/tmp/a.csv',
      limit: 42,
    })
  })

  it('a última ocorrência de uma opção repetida vence', () => {
    expect(parseArgs(['--limit=10', '--limit=20'])).toMatchObject({ limit: 20 })
  })

  it('rejeita opção desconhecida em vez de ignorá-la', () => {
    // Ignorar silenciosamente faria um erro de digitação como --limite=10
    // rodar com o padrão de 500 mil sem ninguém perceber.
    expect(() => parseArgs(['--limite=10'])).toThrow(/Opção desconhecida/)
  })

  it('rejeita argumento solto sem opção', () => {
    expect(() => parseArgs(['arquivo.csv'])).toThrow(InvalidArgumentError)
  })
})
