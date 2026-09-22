import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { SortField } from '../api/types.ts'
import {
  applyFilterChange,
  parseFilters,
  toSearchParams,
  toggleSort as toggleSortIn,
  type UsersFilters,
} from '../lib/userFilters.ts'

export interface UseUsersFiltersResult {
  filters: UsersFilters
  setFilters: (change: Partial<UsersFilters>) => void
  toggleSort: (field: SortField) => void
}

/**
 * A URL é a fonte de verdade dos filtros da listagem (critério S11).
 *
 * Não há estado paralelo em `useState`: a tela lê da URL e escreve na URL.
 * Manter uma cópia local significaria dois lugares podendo discordar — e
 * recarregar a página perderia o contexto, que é justamente o que o requisito
 * proíbe.
 */
export function useUsersFilters(): UseUsersFiltersResult {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo(() => parseFilters(searchParams), [searchParams])

  const setFilters = useCallback(
    (change: Partial<UsersFilters>) => {
      const next = applyFilterChange(parseFilters(searchParams), change)

      // `replace` evita empilhar uma entrada de histórico por tecla digitada:
      // sem isso, o botão Voltar percorreria letra por letra da busca.
      setSearchParams(toSearchParams(next), { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const toggleSort = useCallback(
    (field: SortField) => {
      setSearchParams(toSearchParams(toggleSortIn(parseFilters(searchParams), field)), {
        replace: true,
      })
    },
    [searchParams, setSearchParams],
  )

  return { filters, setFilters, toggleSort }
}
