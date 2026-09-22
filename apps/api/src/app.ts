import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import type { Env } from './lib/env.js'
import { loggerOptions } from './lib/logger.js'
import { healthRoutes } from './modules/health/health.routes.js'

/**
 * Monta a instância do Fastify.
 *
 * Separado de `server.ts` de propósito: os testes de integração constroem a
 * aplicação com um ambiente controlado e usam `app.inject()`, sem abrir porta
 * nem depender de processo externo.
 */
export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(env),
    // Reaproveita o x-request-id recebido, se houver, para não quebrar a
    // correlação quando a requisição vem de outro serviço.
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  })

  await app.register(cors, { origin: env.CORS_ORIGIN })

  // Devolve o identificador ao cliente para que um erro relatado por quem usa
  // a API possa ser localizado no log.
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  await app.register(healthRoutes)

  return app
}
