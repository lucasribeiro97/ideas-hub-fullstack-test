import type { ValidationDetail } from './types.js'

/**
 * Erro vindo da API, já traduzido para uso na interface.
 *
 * Carrega o `code` do contrato (SPEC §6) porque é ele que as telas consultam:
 * `USER_EMAIL_TAKEN` marca o campo de email no formulário,
 * `WEATHER_CITY_NOT_FOUND` pede uma mensagem diferente de uma falha genérica.
 * Comparar strings de mensagem seria frágil e quebraria ao ajustar um texto.
 */
export class ApiError extends Error {
  // Campos declarados explicitamente: o `erasableSyntaxOnly` do template do
  // Vite proíbe propriedades de parâmetro no construtor, por não serem
  // apagáveis na transpilação.
  readonly status: number
  readonly code: string
  readonly details: ValidationDetail[] | undefined

  constructor(status: number, code: string, message: string, details?: ValidationDetail[]) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** Mensagem do campo indicado, quando o servidor apontou qual falhou. */
  messageForField(field: string): string | undefined {
    return this.details?.find((detail) => detail.field === field)?.message
  }
}

const BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: ValidationDetail[] }
}

async function toApiError(response: Response): Promise<ApiError> {
  // A API sempre responde no envelope da §6, mas um proxy ou um 502 de
  // infraestrutura pode devolver HTML. Nesse caso o corpo é inútil e o que
  // resta de informação é o status.
  const body = (await response.json().catch(() => ({}))) as ErrorEnvelope

  return new ApiError(
    response.status,
    body.error?.code ?? 'UNKNOWN_ERROR',
    body.error?.message ?? 'Não foi possível completar a operação.',
    body.error?.details,
  )
}

export interface RequestOptions {
  method?: string
  body?: unknown
  /** Permite cancelar requisições superadas (critério S12). */
  signal?: AbortSignal
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options

  let response: Response

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    // Cancelamento não é falha: precisa continuar sendo um AbortError para que
    // o TanStack Query o reconheça e não exiba mensagem de erro na tela.
    //
    // A verificação é pelo `name` e pelo estado do sinal, e não por
    // `instanceof DOMException`: o tipo concreto do erro de cancelamento varia
    // entre navegador, Node e ambiente de teste. Amarrar a um construtor faria
    // a detecção funcionar num ambiente e falhar silenciosamente em outro.
    if (signal?.aborted === true) throw error
    if (error instanceof Error && error.name === 'AbortError') throw error

    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível contatar o servidor.')
  }

  if (!response.ok) throw await toApiError(response)

  // 204 não tem corpo; tentar interpretá-lo como JSON lançaria erro.
  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}
