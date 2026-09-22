import { z } from 'zod'
import type { User } from '../../db/schema.js'

/*
 * Schemas do módulo de usuários (SPEC §6).
 *
 * As mensagens são escritas à mão em português: as padrão do Zod vêm em inglês
 * ("Invalid email address") e chegariam ao usuário final através do campo
 * `details` da resposta de erro.
 */

const MAX_NAME = 120
// 254 é o limite de endereço de email definido pela RFC 5321.
const MAX_EMAIL = 254
const MAX_PHONE = 30

export const createUserBodySchema = z.object({
  name: z
    .string({ error: 'nome é obrigatório' })
    .trim()
    .min(1, 'nome é obrigatório')
    .max(MAX_NAME, `nome deve ter no máximo ${MAX_NAME} caracteres`),

  // Sem `.toLowerCase()`: a unicidade é garantida pelo índice funcional em
  // lower(email), e normalizar o valor gravado faria o dado divergir da origem
  // (premissa P4 da SPEC).
  email: z
    .string({ error: 'email é obrigatório' })
    .trim()
    .min(1, 'email é obrigatório')
    .max(MAX_EMAIL, `email deve ter no máximo ${MAX_EMAIL} caracteres`)
    .pipe(z.email('email inválido')),

  phone: z
    .string()
    .trim()
    .max(MAX_PHONE, `telefone deve ter no máximo ${MAX_PHONE} caracteres`)
    .nullish()
    // Campo opcional enviado vazio pelo formulário é ausência, não string vazia.
    .transform((value) => (value === '' ? null : (value ?? null))),
})

export type CreateUserInput = z.infer<typeof createUserBodySchema>

export const userResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type UserResponse = z.infer<typeof userResponseSchema>

/**
 * Converte a linha do banco para o contrato público.
 *
 * Existe para que uma coluna nova no schema não vaze automaticamente para a
 * API: o que sai é o que está escrito aqui.
 */
export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}
