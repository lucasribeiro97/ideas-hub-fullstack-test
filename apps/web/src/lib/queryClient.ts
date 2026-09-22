import { QueryClient, type QueryClientConfig } from '@tanstack/react-query'

/**
 * Configuração padrão das consultas.
 *
 * `retry: 1` é deliberado: a API já traduz falhas do serviço externo de clima
 * em erros próprios e estáveis, então repetir muitas vezes só atrasaria a
 * mensagem de erro que a pessoa precisa ver.
 *
 * Os ajustes existem para que os testes desliguem a repetição: nela, o estado
 * de erro só apareceria depois do atraso entre tentativas, tornando a suíte
 * lenta sem verificar nada além do comportamento da própria biblioteca.
 */
export function createQueryClient(overrides: QueryClientConfig['defaultOptions'] = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      ...overrides,
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        ...overrides.queries,
      },
    },
  })
}
