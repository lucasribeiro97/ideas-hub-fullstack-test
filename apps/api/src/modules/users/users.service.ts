import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client.js'
import { firstOrThrow } from '../../lib/rows.js'
import { UserNotFoundError } from '../../lib/errors.js'
import { users } from '../../db/schema.js'
import { toUserResponse, type CreateUserInput, type UserResponse } from './users.schemas.js'

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
