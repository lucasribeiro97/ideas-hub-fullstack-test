import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { Database } from './db/client.js'
import type { Env } from './lib/env.js'
import { loggerOptions } from './lib/logger.js'
import { registerErrorHandling } from './lib/error-handler.js'
import { registerOpenApi } from './lib/openapi.js'
import { healthRoutes } from './modules/health/health.routes.js'
import { usersRoutes } from './modules/users/users.routes.js'
import { weatherRoutes } from './modules/weather/weather.routes.js'
import { createTtlCache } from './modules/weather/weather.cache.js'
import type { WeatherSnapshot } from './modules/weather/weather.schemas.js'

export interface AppDependencies {
  db: Database
}

/**
 * Monta a instância do Fastify.
 *
 * Separado de `server.ts` de propósito: os testes de integração constroem a
 * aplicação com um ambiente controlado e usam `app.inject()`, sem abrir porta
 * nem depender de processo externo.
 *
 * O banco entra por parâmetro, e não é criado aqui, para que os testes usem o
 * Postgres efêmero do Testcontainers sem substituir módulo nenhum.
 */
export async function buildApp(env: Env, deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(env),
    // Reaproveita o x-request-id recebido, se houver, para não quebrar a
    // correlação quando a requisição vem de outro serviço.
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  })

  // Zod valida corpo, params e query das rotas — a mesma biblioteca já usada
  // para as variáveis de ambiente, e a mesma de onde o OpenAPI será derivado.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(cors, { origin: env.CORS_ORIGIN })

  // Devolve o identificador ao cliente para que um erro relatado por quem usa
  // a API possa ser localizado no log.
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  registerErrorHandling(app)

  // Antes das rotas: o plugin precisa observar cada uma sendo registrada para
  // derivar o contrato a partir dos schemas.
  await registerOpenApi(app)

  // O cache vive junto da instância da aplicação: reiniciar o processo o
  // esvazia, o que a SPEC §12 aceita explicitamente.
  const weatherCache = createTtlCache<WeatherSnapshot>({
    ttlMs: env.WEATHER_CACHE_TTL_SECONDS * 1000,
  })

  await app.register(healthRoutes)
  await app.register(usersRoutes(deps.db))
  await app.register(
    weatherRoutes({
      client: {
        baseUrl: env.WEATHER_API_BASE_URL,
        apiKey: env.WEATHER_API_KEY,
        timeoutMs: env.WEATHER_TIMEOUT_MS,
      },
      cache: weatherCache,
    }),
  )

  return app
}
