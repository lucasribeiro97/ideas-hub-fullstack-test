import type { FastifyServerOptions } from 'fastify'
import type { Env } from './env.js'

/**
 * Configuração de log estruturado (TASK-INFRA-04).
 *
 * `redact` é o que garante o critério S8 no nível de log: mesmo que um objeto
 * contendo a chave da WeatherAPI seja logado por engano, o valor não chega à
 * saída. Proteger só o ponto de uso não bastaria — basta um `req.log.info(env)`
 * distraído para vazar.
 */
export function loggerOptions(env: Env): FastifyServerOptions['logger'] {
  if (env.NODE_ENV === 'test') return false

  return {
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'WEATHER_API_KEY',
        '*.WEATHER_API_KEY',
        '*.weatherApiKey',
        'key',
        '*.key',
      ],
      censor: '[oculto]',
    },
    ...(env.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),
  }
}
