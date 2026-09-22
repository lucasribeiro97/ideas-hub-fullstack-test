/**
 * Erros de domínio (SPEC §6).
 *
 * Existem para que o código de negócio expresse o que aconteceu — "esse email
 * já está em uso" — sem precisar conhecer HTTP. A tradução para status e corpo
 * de resposta acontece num único ponto, em `error-handler.ts`.
 */

export interface DetalheValidacao {
  field: string
  message: string
}

export abstract class AppError extends Error {
  abstract readonly code: string
  abstract readonly httpStatus: number

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/** Corpo bem formado que não satisfaz as regras. */
export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR'
  readonly httpStatus = 422

  constructor(
    readonly details: DetalheValidacao[],
    message = 'Dados inválidos.',
  ) {
    super(message)
  }
}

/** Parâmetro de rota ou query malformado — ex.: id que não é UUID. */
export class InvalidParamError extends AppError {
  readonly code = 'INVALID_PARAM'
  readonly httpStatus = 400

  constructor(
    readonly details: DetalheValidacao[],
    message = 'Parâmetro inválido.',
  ) {
    super(message)
  }
}

export class UserNotFoundError extends AppError {
  readonly code = 'USER_NOT_FOUND'
  readonly httpStatus = 404

  constructor(message = 'Usuário não encontrado.') {
    super(message)
  }
}

export class UserEmailTakenError extends AppError {
  readonly code = 'USER_EMAIL_TAKEN'
  readonly httpStatus = 409

  constructor(message = 'Já existe um usuário com este email.') {
    super(message)
  }
}

/**
 * Código SQLSTATE de violação de unicidade.
 *
 * O Drizzle embrulha o erro do driver, então o nome da constraint não aparece
 * na mensagem — só em `cause`. Descoberto ao escrever os testes do M2
 * (TASK-API-01); assumir o contrário faria um email duplicado virar 500.
 */
const SQLSTATE_UNIQUE_VIOLATION = '23505'

interface ErroPostgres {
  code?: string
  constraint?: string
}

function extrairErroPostgres(erro: unknown): ErroPostgres | undefined {
  if (typeof erro !== 'object' || erro === null) return undefined

  const direto = erro as ErroPostgres
  if (typeof direto.code === 'string') return direto

  const causa = (erro as { cause?: unknown }).cause
  if (typeof causa === 'object' && causa !== null) {
    const aninhado = causa as ErroPostgres
    if (typeof aninhado.code === 'string') return aninhado
  }

  return undefined
}

/** Violação do índice único de email, em qualquer caixa. */
export function ehViolacaoDeEmailDuplicado(erro: unknown): boolean {
  const pg = extrairErroPostgres(erro)

  return pg?.code === SQLSTATE_UNIQUE_VIOLATION && pg.constraint === 'users_email_lower_unique'
}
