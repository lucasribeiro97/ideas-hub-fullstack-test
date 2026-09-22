import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { Database } from '../../db/client.js'
import { createUser, getUserById } from './users.service.js'
import {
  createUserBodySchema,
  userIdParamSchema,
  userResponseSchema,
} from './users.schemas.js'

/**
 * Rotas de usuários.
 *
 * Fábrica em vez de plugin direto: o banco chega por parâmetro, o que permite
 * aos testes montarem a aplicação sobre o Postgres efêmero sem variável global
 * nem decorator.
 */
export function usersRoutes(db: Database): FastifyPluginAsync {
  return async function register(app: FastifyInstance): Promise<void> {
    const route = app.withTypeProvider<ZodTypeProvider>()

    route.post(
      '/users',
      {
        schema: {
          tags: ['users'],
          summary: 'Cadastra um usuário',
          body: createUserBodySchema,
          response: { 201: userResponseSchema },
        },
      },
      async (request, reply) => {
        const created = await createUser(db, request.body)

        return reply.status(201).send(created)
      },
    )

    route.get(
      '/users/:id',
      {
        schema: {
          tags: ['users'],
          summary: 'Busca um usuário pelo ID',
          params: userIdParamSchema,
          response: { 200: userResponseSchema },
        },
      },
      async (request) => getUserById(db, request.params.id),
    )
  }
}
