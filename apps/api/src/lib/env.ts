import { z } from 'zod'

/**
 * Contrato das variáveis de ambiente (SPEC §9).
 *
 * A validação acontece na inicialização: a aplicação encerra com mensagem clara
 * se algo faltar, em vez de falhar na primeira requisição que usar a variável.
 *
 * Este é o único módulo autorizado a ler `process.env`.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),

  // `error` cobre tanto a variável ausente quanto a vazia. Usar apenas
  // `.min(1, ...)` deixaria o caso "ausente" com a mensagem genérica do Zod,
  // que não diz o que a pessoa precisa fazer.
  DATABASE_URL: z
    .string({ error: 'obrigatória: string de conexão do PostgreSQL' })
    .min(1, 'obrigatória: string de conexão do PostgreSQL'),

  WEATHER_API_KEY: z
    .string({ error: 'obrigatória: chave da WeatherAPI (veja .env.example)' })
    .min(1, 'obrigatória: chave da WeatherAPI (veja .env.example)'),
  WEATHER_API_BASE_URL: z.string().min(1).default('https://api.weatherapi.com/v1'),
  WEATHER_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  WEATHER_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
})

export type Env = z.infer<typeof envSchema>

/** Erro de configuração: distinto de erro de execução, e sempre fatal. */
export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnvValidationError'
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source)

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n')

    throw new EnvValidationError(
      `Variáveis de ambiente inválidas:\n${problems}\n\n` +
        'Consulte o .env.example na raiz do repositório.',
    )
  }

  return result.data
}
