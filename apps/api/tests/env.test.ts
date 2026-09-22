import { describe, expect, it } from 'vitest'
import { EnvValidationError, loadEnv } from '../src/lib/env.js'

const ambienteMinimo = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  WEATHER_API_KEY: 'chave-de-teste',
}

describe('loadEnv', () => {
  it('aplica os padrões documentados quando só o obrigatório é fornecido', () => {
    const env = loadEnv(ambienteMinimo)

    expect(env.PORT).toBe(3000)
    expect(env.NODE_ENV).toBe('development')
    expect(env.WEATHER_CACHE_TTL_SECONDS).toBe(600)
    expect(env.WEATHER_TIMEOUT_MS).toBe(5000)
  })

  it('converte variáveis numéricas, que chegam sempre como texto', () => {
    const env = loadEnv({ ...ambienteMinimo, PORT: '8080' })

    expect(env.PORT).toBe(8080)
    expect(typeof env.PORT).toBe('number')
  })

  it('falha quando WEATHER_API_KEY está ausente, nomeando a variável', () => {
    const { WEATHER_API_KEY: _omitida, ...semChave } = ambienteMinimo

    expect(() => loadEnv(semChave)).toThrow(EnvValidationError)
    expect(() => loadEnv(semChave)).toThrow(/WEATHER_API_KEY/)
  })

  it('falha quando DATABASE_URL está ausente', () => {
    const { DATABASE_URL: _omitida, ...semBanco } = ambienteMinimo

    expect(() => loadEnv(semBanco)).toThrow(/DATABASE_URL/)
  })

  it('rejeita valor numérico inválido em vez de cair no padrão', () => {
    expect(() => loadEnv({ ...ambienteMinimo, PORT: 'não-é-número' })).toThrow(
      EnvValidationError,
    )
  })

  it('acumula todos os problemas numa mensagem só', () => {
    try {
      loadEnv({})
      expect.unreachable('loadEnv deveria ter lançado')
    } catch (erro) {
      const mensagem = (erro as Error).message
      expect(mensagem).toMatch(/DATABASE_URL/)
      expect(mensagem).toMatch(/WEATHER_API_KEY/)
    }
  })
})
