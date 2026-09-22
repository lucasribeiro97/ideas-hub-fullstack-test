import { eq, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.js'
import { firstOrThrow } from '../../lib/rows.js'
import { UserNotFoundError } from '../../lib/errors.js'
import { users } from '../../db/schema.js'
import {
  toUserResponse,
  type CreateUserInput,
  type ListUsersQuery,
  type ListUsersResponse,
  type UserResponse,
} from './users.schemas.js'
import { buildOrderBy, buildSearchCondition } from './users.query.js'

/**
 * Cria um usuário.
 *
 * Não há verificação prévia de email existente de propósito: um `SELECT` antes
 * do `INSERT` abriria uma janela de corrida entre as duas consultas, e duas
 * requisições simultâneas com o mesmo email poderiam passar ambas. Quem decide
 * é o índice único, e a violação é traduzida para HTTP 409 no ponto único de
 * tratamento de erros (SPEC §6).
 */
export async function createUser(db: Database, input: CreateUserInput): Promise<UserResponse> {
  const created = await db
    .insert(users)
    .values({ name: input.name, email: input.email, phone: input.phone })
    .returning()

  return toUserResponse(firstOrThrow(created, 'insert não retornou a linha criada'))
}

/**
 * Busca um usuário pelo identificador.
 *
 * A ausência é condição de negócio, não erro de programação: por isso lança
 * UserNotFoundError, que o tratamento de erros traduz em 404, em vez de usar
 * firstOrThrow, que sinalizaria defeito interno.
 */
export async function getUserById(db: Database, id: string): Promise<UserResponse> {
  const [found] = await db.select().from(users).where(eq(users.id, id)).limit(1)

  if (!found) throw new UserNotFoundError()

  return toUserResponse(found)
}

/**
 * Lista usuários com busca parcial, ordenação e paginação (SPEC §6).
 *
 * A contagem roda em consulta separada, com o mesmo filtro da listagem. É o
 * custo de oferecer `total` e `totalPages`, que a interface precisa para
 * numerar páginas — trade-off registrado na SPEC §6 e limitado por `perPage`
 * máximo de 100.
 */
export async function listUsers(db: Database, query: ListUsersQuery): Promise<ListUsersResponse> {
  const where = buildSearchCondition(query.search)
  const offset = (query.page - 1) * query.perPage

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(users)
      .where(where)
      .orderBy(...buildOrderBy(query.sort, query.order))
      .limit(query.perPage)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(users).where(where),
  ])

  // `count(*)` sempre devolve exatamente uma linha; retorno vazio aqui seria
  // defeito interno, não lista sem resultados.
  const total = firstOrThrow(totals, 'count não retornou linha').total

  return {
    data: rows.map(toUserResponse),
    meta: {
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.ceil(total / query.perPage),
    },
  }
}
