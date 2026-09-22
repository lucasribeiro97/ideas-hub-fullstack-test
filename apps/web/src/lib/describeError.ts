import { ApiError } from '../api/client.ts'

export interface ErrorDescription {
  title: string
  description: string
  /** Se repetir a mesma operação tem chance de funcionar. */
  canRetry: boolean
}

/**
 * Traduz um erro em algo acionável para quem está na tela.
 *
 * A mensagem crua da API responde "o que aconteceu"; quem está usando precisa
 * saber "o que fazer agora". Uma falha de rede pede para verificar a conexão;
 * um erro do servidor pede para tentar de novo; um recurso inexistente não
 * melhora com repetição, e oferecer "tentar novamente" ali seria enganoso.
 */
export function describeError(error: unknown): ErrorDescription {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK_ERROR') {
      return {
        title: 'Não foi possível contatar o servidor',
        description:
          'Verifique sua conexão e se a API está em execução. Nada foi alterado.',
        canRetry: true,
      }
    }

    if (error.status >= 500) {
      return {
        title: 'O servidor encontrou um problema',
        description: 'Tente novamente em instantes. Se persistir, verifique os logs da API.',
        canRetry: true,
      }
    }

    if (error.status === 404) {
      return {
        title: 'Não encontrado',
        description: error.message,
        canRetry: false,
      }
    }

    // Demais erros do cliente: a mensagem da API já é específica e escrita
    // para quem chamou.
    return { title: 'Não foi possível completar a operação', description: error.message, canRetry: false }
  }

  return {
    title: 'Algo deu errado',
    description: 'Ocorreu um erro inesperado ao carregar os dados.',
    canRetry: true,
  }
}
