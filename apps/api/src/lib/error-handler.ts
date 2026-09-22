import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import {
  AppError,
  InvalidParamError,
  ValidationError,
  ehViolacaoDeEmailDuplicado,
  UserEmailTakenError,
  type DetalheValidacao,
} from './errors.js'

interface CorpoDeErro {
  error: {
    code: string
    message: string
    details?: DetalheValidacao[]
  }
}

function montarCorpo(
  code: string,
  message: string,
  details?: DetalheValidacao[],
): CorpoDeErro {
  return { error: details?.length ? { code, message, details } : { code, message } }
}

function detalhesDoZod(erro: ZodError): DetalheValidacao[] {
  return erro.issues.map((issue) => ({
    field: issue.path.join('.') || '(raiz)',
    message: issue.message,
  }))
}

/**
 * Onde o erro aconteceu decide o status: corpo inválido é 422, parâmetro de
 * rota ou query inválido é 400 (SPEC §6).
 */
function erroDeValidacaoDoFastify(erro: FastifyError): AppError | undefined {
  if (!erro.validation) return undefined

  // O provider do Zod preenche `instancePath` inclusive para campo ausente
  // (verificado em teste), então não há caso em que seja necessário recorrer a
  // `params.missingProperty` como acontece com o AJV.
  const details: DetalheValidacao[] = erro.validation.map((problema) => ({
    field: problema.instancePath.replace(/^\//, '') || '(raiz)',
    message: problema.message ?? 'valor inválido',
  }))

  return erro.validationContext === 'body'
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
export function registrarTratamentoDeErros(app: FastifyInstance): void {
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    void reply
      .status(404)
      .send(montarCorpo('ROUTE_NOT_FOUND', `Rota não encontrada: ${request.method} ${request.url}`))
  })

  app.setErrorHandler((erro: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // 1. Erros de domínio já sabem o próprio status.
    if (erro instanceof AppError) {
      const details = erro instanceof ValidationError || erro instanceof InvalidParamError
        ? erro.details
        : undefined

      void reply.status(erro.httpStatus).send(montarCorpo(erro.code, erro.message, details))
      return
    }

    // 2. Violação do índice único de email, vinda do banco.
    if (ehViolacaoDeEmailDuplicado(erro)) {
      const conflito = new UserEmailTakenError()
      void reply.status(conflito.httpStatus).send(montarCorpo(conflito.code, conflito.message))
      return
    }

    // 3. Validação por schema do Fastify.
    const validacao = erroDeValidacaoDoFastify(erro)
    if (validacao) {
      const details = validacao instanceof ValidationError || validacao instanceof InvalidParamError
        ? validacao.details
        : undefined

      void reply.status(validacao.httpStatus).send(montarCorpo(validacao.code, validacao.message, details))
      return
    }

    // 4. Zod lançado diretamente por um serviço.
    if (erro instanceof ZodError) {
      const convertido = new ValidationError(detalhesDoZod(erro))
      void reply
        .status(convertido.httpStatus)
        .send(montarCorpo(convertido.code, convertido.message, convertido.details))
      return
    }

    // 5. JSON malformado e demais erros que o Fastify já classificou como 4xx.
    if (typeof erro.statusCode === 'number' && erro.statusCode >= 400 && erro.statusCode < 500) {
      void reply.status(erro.statusCode).send(montarCorpo('INVALID_PARAM', 'Requisição inválida.'))
      return
    }

    // 6. Qualquer outra coisa é falha nossa: o detalhe vai para o log, e quem
    // chamou recebe apenas o código genérico. O x-request-id devolvido no
    // cabeçalho é o que liga a resposta a esta linha de log.
    request.log.error({ err: erro }, 'erro não tratado')

    void reply
      .status(500)
      .send(montarCorpo('INTERNAL_ERROR', 'Erro interno. Tente novamente mais tarde.'))
  })
}
