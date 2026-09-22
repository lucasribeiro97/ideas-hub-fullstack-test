import { z } from 'zod'
import type { User } from '../../db/schema.js'

/*
 * Schemas do módulo de usuários (SPEC §6).
 *
 * As mensagens são escritas à mão em português: as padrão do Zod vêm em inglês
 * ("Invalid email address") e chegariam ao usuário final através do campo
 * `details` da resposta de erro.
 */

// Exportados para que a importação em massa aplique exatamente os mesmos
// limites da API. Se divergissem, o CSV poderia gravar um nome que o
// formulário de edição depois recusaria.
export const MAX_NAME = 120
// 254 é o limite de endereço de email definido pela RFC 5321.
export const MAX_EMAIL = 254
export const MAX_PHONE = 30

/**
 * Recusa caracteres de controle em qualquer texto vindo de fora.
 *
 * O byte NUL é o motivo: ele não é espaço em branco, então atravessava o
 * `trim()` e o validador de email, chegava ao Postgres como parâmetro e era
 * recusado lá com SQLSTATE 22021. Esse erro não é nenhum dos casos tratados,
 * então virava `500 INTERNAL_ERROR` e uma linha `error` com pilha no log — por
 * entrada que qualquer cliente consegue enviar, e que o catálogo da SPEC §6
 * manda classificar como `400` ou `422`.
 *
 * A regra vale para os campos de escrita e também para `search`, onde o mesmo
 * byte produzia o mesmo 500.
 */
// A regra `no-control-regex` existe para pegar caractere de controle colocado
// na expressão por acidente. Aqui ele é justamente o que se procura.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

const CONTROL_CHARACTERS_MESSAGE = 'não pode conter caracteres de controle'

function withoutControlCharacters(value: string): boolean {
  return !CONTROL_CHARACTERS.test(value)
}

export const createUserBodySchema = z.object({
  name: z
    .string({ error: 'nome é obrigatório' })
    .trim()
    .min(1, 'nome é obrigatório')
    .max(MAX_NAME, `nome deve ter no máximo ${MAX_NAME} caracteres`)
    .refine(withoutControlCharacters, `nome ${CONTROL_CHARACTERS_MESSAGE}`),

  // Sem `.toLowerCase()`: a unicidade é garantida pelo índice funcional em
  // lower(email), e normalizar o valor gravado faria o dado divergir da origem
  // (premissa P4 da SPEC).
  email: z
    .string({ error: 'email é obrigatório' })
    .trim()
    .min(1, 'email é obrigatório')
    .max(MAX_EMAIL, `email deve ter no máximo ${MAX_EMAIL} caracteres`)
    .refine(withoutControlCharacters, `email ${CONTROL_CHARACTERS_MESSAGE}`)
    .pipe(z.email('email inválido')),

  phone: z
    .string()
    .trim()
    .max(MAX_PHONE, `telefone deve ter no máximo ${MAX_PHONE} caracteres`)
    .refine(withoutControlCharacters, `telefone ${CONTROL_CHARACTERS_MESSAGE}`)
    .nullish()
    // Campo opcional enviado vazio pelo formulário é ausência, não string vazia.
    .transform((value) => (value === '' ? null : (value ?? null))),
})

export type CreateUserInput = z.infer<typeof createUserBodySchema>

/**
 * Atualização parcial: todos os campos são opcionais.
 *
 * A exigência de ao menos um campo é verificada no service, e não por
 * `.refine()` aqui, para manter o schema como objeto simples — o gerador de
 * OpenAPI do M7 lida melhor com isso do que com schema embrulhado em efeito.
 */
export const updateUserBodySchema = createUserBodySchema.partial()

export type UpdateUserInput = z.infer<typeof updateUserBodySchema>

/**
 * Identificador na rota.
 *
 * Validar aqui é o que separa "id malformado" de "usuário inexistente": sem
 * isso, `/users/abc` chegaria ao banco e o Postgres devolveria erro de sintaxe
 * de UUID, que viraria 500 em vez do 400 previsto na SPEC §6.
 */
export const userIdParamSchema = z.object({
  id: z.uuid('id deve ser um UUID'),
})

/** Campos por onde a listagem pode ser ordenada (SPEC §6). */
export const SORTABLE_FIELDS = ['name', 'email', 'createdAt'] as const

const MAX_PER_PAGE = 100

/**
 * Teto de `page`.
 *
 * `perPage` sempre teve limite; o `OFFSET` não tinha nenhum, e é ele que custa.
 * Um `OFFSET` gigante impede a ordenação limitada ao topo, então o banco
 * precisa ordenar o conjunto inteiro — com `sort=name`, que não tem índice,
 * isso é varredura completa mais ordenação em disco a cada requisição. Medido
 * com 220.874 registros: 330 ms e 22 MB de arquivo temporário por chamada, e
 * 200 chamadas simultâneas levaram uma listagem comum de 12 ms para 9,3 s,
 * porque as conexões do pool ficavam todas ocupadas.
 *
 * O valor precisa ser generoso o bastante para não esconder dado real: a SPEC
 * §3 projeta 1.598.726 usuários distintos na carga completa, o que dá 159.873
 * páginas no menor `perPage` usado pela interface. 200.000 cobre isso com folga
 * e ainda assim recusa os pedidos absurdos antes de tocar no banco.
 */
export const MAX_PAGE = 200_000

export const listUsersQuerySchema = z.object({
  // `search` ausente e `search` vazio significam a mesma coisa: sem filtro.
  // Sem isso, limpar o campo de busca na interface enviaria search='' e a
  // consulta filtraria por string vazia.
  search: z
    .string()
    .trim()
    .refine(withoutControlCharacters, `search ${CONTROL_CHARACTERS_MESSAGE}`)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),

  page: z.coerce
    .number('page deve ser um número')
    .int()
    .min(1, 'page deve ser no mínimo 1')
    .max(MAX_PAGE, `page deve ser no máximo ${MAX_PAGE}`)
    .default(1),

  perPage: z.coerce
    .number('perPage deve ser um número')
    .int()
    .min(1, 'perPage deve ser no mínimo 1')
    .max(MAX_PER_PAGE, `perPage deve ser no máximo ${MAX_PER_PAGE}`)
    .default(20),

  sort: z.enum(SORTABLE_FIELDS, `sort deve ser um de: ${SORTABLE_FIELDS.join(', ')}`).default('createdAt'),

  order: z.enum(['asc', 'desc'], 'order deve ser asc ou desc').default('desc'),
})

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>

export const userResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type UserResponse = z.infer<typeof userResponseSchema>

export const listUsersResponseSchema = z.object({
  data: z.array(userResponseSchema),
  meta: z.object({
    page: z.number().int(),
    perPage: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
})

export type ListUsersResponse = z.infer<typeof listUsersResponseSchema>

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
