import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import { loadEnv } from '../src/lib/env.js'
import { loggerOptions } from '../src/lib/logger.js'

const base = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  WEATHER_API_KEY: 'chave-de-teste',
}

describe('loggerOptions', () => {
  it('desliga o log em ambiente de teste, para não poluir a saída da suíte', () => {
    expect(loggerOptions(loadEnv({ ...base, NODE_ENV: 'test' }))).toBe(false)
  })

  it('usa pino-pretty apenas em desenvolvimento', () => {
    const dev = loggerOptions(loadEnv({ ...base, NODE_ENV: 'development' }))
    const prod = loggerOptions(loadEnv({ ...base, NODE_ENV: 'production' }))

    expect(dev).toMatchObject({ transport: { target: 'pino-pretty' } })
    expect(prod).not.toHaveProperty('transport')
  })

  it('respeita o nível de log configurado', () => {
    const options = loggerOptions(loadEnv({ ...base, NODE_ENV: 'production', LOG_LEVEL: 'debug' }))

    expect(options).toMatchObject({ level: 'debug' })
  })

  // Critério S8: a chave da WeatherAPI não pode vazar nem por log acidental.
  it('mantém a chave da API na lista de campos ocultados', () => {
    const options = loggerOptions(loadEnv({ ...base, NODE_ENV: 'production' }))
    const paths = (options as { redact: { paths: string[] } }).redact.paths

    expect(paths).toContain('WEATHER_API_KEY')
    expect(paths).toContain('*.WEATHER_API_KEY')
    expect(paths).toContain('req.headers.authorization')
  })
})

/*
 * Verificar a lista de caminhos redatados prova apenas que a configuração
 * existe. Estes testes escrevem log de verdade num fluxo em memória e procuram
 * a chave na saída — é o que comprova o critério S8 no lado do log.
 */
describe('redação da chave em log real', () => {
  const CHAVE = 'CHAVE-SECRETA-EM-LOG-987'

  function captureLogs(): { stream: Writable; output: () => string } {
    const chunks: string[] = []
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString())
        callback()
      },
    })

    return { stream, output: () => chunks.join('') }
  }

  async function logAndCapture(payload: object): Promise<string> {
    const { stream, output } = captureLogs()
    const env = loadEnv({ ...base, NODE_ENV: 'production' })
    const options = loggerOptions(env)

    const app = Fastify({ logger: { ...(options as object), stream } })
    app.log.info(payload, 'mensagem de teste')
    await app.close()

    return output()
  }

  it('oculta a chave logada em objeto de nível superior', async () => {
    const output = await logAndCapture({ WEATHER_API_KEY: CHAVE })

    expect(output).not.toContain(CHAVE)
    expect(output).toContain('[oculto]')
  })

  it('oculta a chave logada dentro de um objeto aninhado', async () => {
    const output = await logAndCapture({ config: { WEATHER_API_KEY: CHAVE } })

    expect(output).not.toContain(CHAVE)
  })

  it('oculta o campo key, que é como a WeatherAPI nomeia a chave', async () => {
    const output = await logAndCapture({ key: CHAVE })

    expect(output).not.toContain(CHAVE)
  })

  it('não oculta campos comuns, para o log seguir sendo útil', async () => {
    const output = await logAndCapture({ city: 'São Paulo', statusCode: 200 })

    expect(output).toContain('São Paulo')
    expect(output).toContain('200')
  })
})
