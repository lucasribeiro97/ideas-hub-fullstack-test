interface TableSkeletonProps {
  rows?: number
  columns?: number
}

/**
 * Espaço reservado durante a primeira carga.
 *
 * Ocupa aproximadamente a altura da tabela real, o que evita o salto de
 * layout quando os dados chegam. `aria-hidden` mantém o ruído visual fora da
 * leitura — quem usa leitor de tela recebe o aviso de carregamento pelo
 * `aria-live` da região, que é informação útil, e não vinte linhas falsas.
 */
export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <div className="table-wrapper" aria-hidden="true">
      <table className="skeleton">
        <tbody>
          {Array.from({ length: rows }, (_unused, row) => (
            <tr key={row}>
              {Array.from({ length: columns }, (_unusedCol, column) => (
                <td key={column}>
                  <span className="skeleton__bar" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
