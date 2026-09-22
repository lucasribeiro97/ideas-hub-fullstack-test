import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listUsers } from '../api/users.ts'
import type { UserList } from '../api/types.ts'
import type { UsersFilters } from '../lib/userFilters.ts'

/**
 * Consulta a listagem de usuários.
 *
 * A chave inclui todos os filtros, então cada combinação tem entrada própria
 * no cache — voltar para a página anterior mostra o resultado imediatamente.
 *
 * O `signal` do TanStack Query é repassado ao fetch: é o que cancela a
 * requisição quando os filtros mudam antes de a resposta chegar (critério
 * S12).
 */
export function useUsers(filters: UsersFilters): UseQueryResult<UserList> {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: ({ signal }) => listUsers(filters, { signal }),
    // Mantém a página anterior visível enquanto a próxima carrega, em vez de
    // piscar a tabela inteira a cada navegação.
    placeholderData: (previous) => previous,
  })
}
