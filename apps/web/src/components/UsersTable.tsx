import { Link, useLocation } from 'react-router-dom'
import type { SortField, User } from '../api/types.ts'
import type { UsersFilters } from '../lib/userFilters.ts'

interface Column {
  field: SortField | null
  label: string
}

const COLUMNS: Column[] = [
  { field: 'name', label: 'Nome' },
  { field: 'email', label: 'Email' },
  { field: null, label: 'Telefone' },
  { field: 'createdAt', label: 'Cadastrado em' },
]

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso))
}

interface UsersTableProps {
  users: User[]
  filters: UsersFilters
  onToggleSort: (field: SortField) => void
}

export function UsersTable({ users, filters, onToggleSort }: UsersTableProps) {
  const location = useLocation()
  return (
    <div className="table-wrapper">
      <table>
        <caption className="visually-hidden">
          Usuários cadastrados, ordenados por {filters.sort} em ordem{' '}
          {filters.order === 'asc' ? 'crescente' : 'decrescente'}
        </caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => {
              const isSorted = column.field !== null && filters.sort === column.field

              return (
                <th
                  key={column.label}
                  scope="col"
                  // `aria-sort` é o que informa a ordenação a quem usa leitor
                  // de tela; a seta sozinha é invisível para essa pessoa.
                  aria-sort={
                    isSorted
                      ? filters.order === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  {column.field === null ? (
                    column.label
                  ) : (
                    <button
                      type="button"
                      className="table__sort"
                      onClick={() => {
                        onToggleSort(column.field as SortField)
                      }}
                    >
                      {column.label}
                      <span aria-hidden="true">{isSorted ? (filters.order === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span>
                    </button>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                {/* A query da listagem viaja junto para que a tela de detalhe
                    saiba a que busca voltar depois de editar ou excluir. */}
                <Link to={`/users/${user.id}`} state={{ from: location.search }}>
                  {user.name}
                </Link>
              </td>
              <td>{user.email}</td>
              <td>{user.phone ?? <span className="text-muted">—</span>}</td>
              <td>
                <time dateTime={user.createdAt}>{formatDate(user.createdAt)}</time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
