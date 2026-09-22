/**
 * Erros de domínio (SPEC §6).
 *
 * Existem para que o código de negócio expresse o que aconteceu — "esse email
 * já está em uso" — sem precisar conhecer HTTP. A tradução para status e corpo
 * de resposta acontece num único ponto, em `error-handler.ts`.
 */

export interface ValidationDetail {
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
    readonly details: ValidationDetail[],
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
    readonly details: ValidationDetail[],
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

/*
 * Erros da integração climática (SPEC §6).
 *
 * Existem para que a origem externa nunca dite o status da nossa API: o que
 * quer que a WeatherAPI responda, quem consome esta API vê um dos códigos
 * abaixo, com significado estável.
 */

export class WeatherCityNotFoundError extends AppError {
  readonly code = 'WEATHER_CITY_NOT_FOUND'
  readonly httpStatus = 404

  constructor(message = 'Cidade não encontrada.') {
    super(message)
  }
}

export class WeatherTimeoutError extends AppError {
  readonly code = 'WEATHER_TIMEOUT'
  readonly httpStatus = 504

  constructor(message = 'O serviço de clima demorou a responder. Tente novamente.') {
    super(message)
  }
}

export class WeatherRateLimitedError extends AppError {
  readonly code = 'WEATHER_RATE_LIMITED'
  readonly httpStatus = 429

  constructor(message = 'Limite de consultas ao serviço de clima atingido. Tente mais tarde.') {
    super(message)
  }
}

export class WeatherUpstreamError extends AppError {
  readonly code = 'WEATHER_UPSTREAM_ERROR'
  readonly httpStatus = 502

  constructor(message = 'O serviço de clima está indisponível no momento.') {
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
const EMAIL_UNIQUE_CONSTRAINT = 'users_email_lower_unique'

interface PostgresError {
  code?: string
  constraint?: string
}

function extractPostgresError(error: unknown): PostgresError | undefined {
  if (typeof error !== 'object' || error === null) return undefined

  const direct = error as PostgresError
  if (typeof direct.code === 'string') return direct

  const cause = (error as { cause?: unknown }).cause
  if (typeof cause === 'object' && cause !== null) {
    const nested = cause as PostgresError
    if (typeof nested.code === 'string') return nested
  }

  return undefined
}

/** Violação do índice único de email, em qualquer caixa. */
export function isDuplicateEmailViolation(error: unknown): boolean {
  const pgError = extractPostgresError(error)

  return (
    pgError?.code === SQLSTATE_UNIQUE_VIOLATION &&
    pgError.constraint === EMAIL_UNIQUE_CONSTRAINT
  )
}
