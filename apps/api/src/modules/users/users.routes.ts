import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { Database } from '../../db/client.js'
import {
  createUser,
  deleteUser,
  getUserById,
  listUsers,
  updateUser,
} from './users.service.js'
import {
  createUserBodySchema,
  listUsersQuerySchema,
  listUsersResponseSchema,
  updateUserBodySchema,
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
      '/users',
      {
        schema: {
          tags: ['users'],
          summary: 'Lista e pesquisa usuários',
          querystring: listUsersQuerySchema,
          response: { 200: listUsersResponseSchema },
        },
      },
      async (request) => listUsers(db, request.query),
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

    route.patch(
      '/users/:id',
      {
        schema: {
          tags: ['users'],
          summary: 'Atualiza um usuário',
          params: userIdParamSchema,
          body: updateUserBodySchema,
          response: { 200: userResponseSchema },
        },
      },
      async (request) => updateUser(db, request.params.id, request.body),
    )

    route.delete(
      '/users/:id',
      {
        schema: {
          tags: ['users'],
          summary: 'Remove um usuário',
          params: userIdParamSchema,
        },
      },
      async (request, reply) => {
        await deleteUser(db, request.params.id)

        return reply.status(204).send()
      },
    )
  }
}
