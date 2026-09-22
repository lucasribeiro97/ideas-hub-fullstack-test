import { eq, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.js'
import { firstOrThrow } from '../../lib/rows.js'
import { UserNotFoundError, ValidationError } from '../../lib/errors.js'
import { users } from '../../db/schema.js'
import {
  toUserResponse,
  type CreateUserInput,
  type ListUsersQuery,
  type ListUsersResponse,
  type UpdateUserInput,
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

/**
 * Atualiza parcialmente um usuário.
 *
 * Trocar o email para um já usado por outro usuário viola o índice único e
 * vira 409 no tratamento de erros. Manter o próprio email não viola nada: o
 * índice compara a linha com as demais, e ela não conflita consigo mesma —
 * comportamento do Postgres, coberto por teste para não regredir caso alguém
 * acrescente uma verificação manual de unicidade no futuro.
 */
export async function updateUser(
  db: Database,
  id: string,
  input: UpdateUserInput,
): Promise<UserResponse> {
  if (Object.keys(input).length === 0) {
    throw new ValidationError(
      [{ field: '(raiz)', message: 'informe ao menos um campo para atualizar' }],
    )
  }

  const updated = await db.update(users).set(input).where(eq(users.id, id)).returning()

  // Array vazio aqui significa que o WHERE não casou: o usuário não existe.
  if (updated.length === 0) throw new UserNotFoundError()

  return toUserResponse(firstOrThrow(updated, 'update não retornou a linha alterada'))
}

/**
 * Remove um usuário definitivamente.
 *
 * Sem soft delete, conforme os limites da SPEC §12: não há requisito de
 * histórico ou recuperação, e uma coluna `deleted_at` obrigaria toda consulta
 * a filtrá-la — inclusive o índice único de email, que passaria a permitir
 * cadastrar de novo um email "removido".
 *
 * `returning` é o que distingue "removi" de "não havia o que remover": sem
 * ele, apagar um id inexistente responderia 204 e o cliente acharia que
 * funcionou.
 */
export async function deleteUser(db: Database, id: string): Promise<void> {
  const deleted = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id })

  if (deleted.length === 0) throw new UserNotFoundError()
}
