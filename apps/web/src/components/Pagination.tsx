import type { PaginationMeta } from '../api/types.ts'

interface PaginationProps {
  meta: PaginationMeta
  onChangePage: (page: number) => void
  disabled?: boolean
}

const formatter = new Intl.NumberFormat('pt-BR')

/**
 * Controles de paginação.
 *
 * Sem lista numerada de páginas: a busca por "souza" tem 5.939 páginas sobre
 * o dataset real, e nenhuma régua de números é utilizável nessa escala. Os
 * atalhos para primeira e última página resolvem o que a régua resolveria.
 *
 * O `aria-live` anuncia a mudança de página a quem usa leitor de tela — sem
 * ele, clicar em "próxima" não produz nenhum retorno audível.
 */
export function Pagination({ meta, onChangePage, disabled = false }: PaginationProps) {
  const isFirst = meta.page <= 1
  const isLast = meta.page >= meta.totalPages

  const firstItem = (meta.page - 1) * meta.perPage + 1
  const lastItem = Math.min(meta.page * meta.perPage, meta.total)

  return (
    <nav className="pagination" aria-label="Paginação">
      <p className="pagination__status" aria-live="polite">
        {meta.total === 0
          ? 'Nenhum resultado'
          : `${formatter.format(firstItem)}–${formatter.format(lastItem)} de ${formatter.format(meta.total)}`}
        {meta.totalPages > 1 &&
          ` · página ${formatter.format(meta.page)} de ${formatter.format(meta.totalPages)}`}
      </p>

      <div className="pagination__controls">
        <button
          type="button"
          className="button"
          onClick={() => {
            onChangePage(1)
          }}
          disabled={disabled || isFirst}
        >
          Primeira
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            onChangePage(meta.page - 1)
          }}
          disabled={disabled || isFirst}
        >
          Anterior
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            onChangePage(meta.page + 1)
          }}
          disabled={disabled || isLast}
        >
          Próxima
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            onChangePage(meta.totalPages)
          }}
          disabled={disabled || isLast}
        >
          Última
        </button>
      </div>
    </nav>
  )
}
