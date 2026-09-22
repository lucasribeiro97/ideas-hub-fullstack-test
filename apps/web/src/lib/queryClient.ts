import { QueryClient } from '@tanstack/react-query'

/**
 * Configuração padrão das consultas.
 *
 * `retry: 1` é deliberado: a API já traduz falhas do serviço externo de clima
 * em erros próprios e estáveis, então repetir muitas vezes só atrasaria a
 * mensagem de erro que a pessoa precisa ver.
 */
export function criarQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  })
}
