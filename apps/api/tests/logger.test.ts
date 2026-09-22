import { describe, expect, it } from 'vitest'
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
