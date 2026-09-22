import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import {
  AppError,
  InvalidParamError,
  ValidationError,
  isDuplicateEmailViolation,
  UserEmailTakenError,
  type ValidationDetail,
} from './errors.js'

interface ErrorBody {
  error: {
    code: string
    message: string
    details?: ValidationDetail[]
  }
}

function buildErrorBody(
  code: string,
  message: string,
  details?: ValidationDetail[],
): ErrorBody {
  return { error: details?.length ? { code, message, details } : { code, message } }
}

/** Erros com `details` são exatamente os dois de validação. */
function detailsOf(error: AppError): ValidationDetail[] | undefined {
  return error instanceof ValidationError || error instanceof InvalidParamError
    ? error.details
    : undefined
}

function zodDetails(error: ZodError): ValidationDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(raiz)',
    message: issue.message,
  }))
}

/**
 * Onde o erro aconteceu decide o status: corpo inválido é 422, parâmetro de
 * rota ou query inválido é 400 (SPEC §6).
 */
function fromFastifyValidation(error: FastifyError): AppError | undefined {
  if (!error.validation) return undefined

  // O provider do Zod preenche `instancePath` inclusive para campo ausente
  // (verificado em teste), então não há caso em que seja necessário recorrer a
  // `params.missingProperty` como acontece com o AJV.
  const details: ValidationDetail[] = error.validation.map((issue) => ({
    field: issue.instancePath.replace(/^\//, '') || '(raiz)',
    message: issue.message ?? 'valor inválido',
  }))

  return error.validationContext === 'body'
    ? new ValidationError(details)
    : new InvalidParamError(details)
}

/**
 * Ponto único de tradução de erro para HTTP (TASK-API-02).
 *
 * Registrado como função exportada, e não embutido em `buildApp`, para que os
 * testes montem uma aplicação mínima com rotas que lançam erros de propósito,
 * sem poluir as rotas de produção com caminhos de teste.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    void reply
      .status(404)
      .send(
        buildErrorBody('ROUTE_NOT_FOUND', `Rota não encontrada: ${request.method} ${request.url}`),
      )
  })

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // 1. Erros de domínio já sabem o próprio status.
    if (error instanceof AppError) {
      void reply.status(error.httpStatus).send(buildErrorBody(error.code, error.message, detailsOf(error)))
      return
    }

    // 2. Violação do índice único de email, vinda do banco.
    if (isDuplicateEmailViolation(error)) {
      const conflict = new UserEmailTakenError()
      void reply.status(conflict.httpStatus).send(buildErrorBody(conflict.code, conflict.message))
      return
    }

    // 3. Validação por schema do Fastify.
    const validation = fromFastifyValidation(error)
    if (validation) {
      void reply
        .status(validation.httpStatus)
        .send(buildErrorBody(validation.code, validation.message, detailsOf(validation)))
      return
    }

    // 4. Zod lançado diretamente por um serviço.
    if (error instanceof ZodError) {
      const converted = new ValidationError(zodDetails(error))
      void reply
        .status(converted.httpStatus)
        .send(buildErrorBody(converted.code, converted.message, converted.details))
      return
    }

    // 5. JSON malformado e demais erros que o Fastify já classificou como 4xx.
    if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      void reply.status(error.statusCode).send(buildErrorBody('INVALID_PARAM', 'Requisição inválida.'))
      return
    }

    // 6. Qualquer outra coisa é falha nossa: o detalhe vai para o log, e quem
    // chamou recebe apenas o código genérico. O x-request-id devolvido no
    // cabeçalho é o que liga a resposta a esta linha de log.
    request.log.error({ err: error }, 'erro não tratado')

    void reply
      .status(500)
      .send(buildErrorBody('INTERNAL_ERROR', 'Erro interno. Tente novamente mais tarde.'))
  })
}
