import { Link } from 'react-router-dom'
import { PageHeading } from '../components/PageHeading.tsx'
import { Pagination } from '../components/Pagination.tsx'
import { UsersTable } from '../components/UsersTable.tsx'
import { useUsers } from '../hooks/useUsers.ts'
import { useUsersFilters } from '../hooks/useUsersFilters.ts'
import { PER_PAGE_OPTIONS } from '../lib/userFilters.ts'

export function UsersListPage() {
  const { filters, setFilters, toggleSort } = useUsersFilters()
  const { data, isPending, isError, error, isPlaceholderData } = useUsers(filters)

  return (
    <>
      <PageHeading
        title="Usuários"
        description="Pesquise, ordene e navegue pelos usuários cadastrados."
        actions={
          <Link className="button button--primary" to="/users/new">
            Novo usuário
          </Link>
        }
      />

      <form
        className="filters"
        role="search"
        onSubmit={(event) => {
          // A busca acontece enquanto se digita; o submit existe só para que
          // pressionar Enter no campo não recarregue a página.
          event.preventDefault()
        }}
      >
        <div className="field">
          <label htmlFor="busca">Buscar por nome ou email</label>
          <input
            id="busca"
            type="search"
            value={filters.search}
            placeholder="ex.: souza"
            onChange={(event) => {
              setFilters({ search: event.target.value })
            }}
          />
        </div>

        <div className="field field--compact">
          <label htmlFor="por-pagina">Itens por página</label>
          <select
            id="por-pagina"
            value={filters.perPage}
            onChange={(event) => {
              setFilters({ perPage: Number(event.target.value) })
            }}
          >
            {PER_PAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </form>

      {isPending && <p>Carregando usuários…</p>}

      {isError && (
        <p role="alert" className="error">
          {error.message}
        </p>
      )}

      {data !== undefined && (
        <>
          {data.data.length === 0 ? (
            <p>
              {filters.search.length > 0
                ? `Nenhum usuário encontrado para "${filters.search}".`
                : 'Nenhum usuário cadastrado ainda.'}
            </p>
          ) : (
            <UsersTable users={data.data} filters={filters} onToggleSort={toggleSort} />
          )}

          <Pagination
            meta={data.meta}
            disabled={isPlaceholderData}
            onChangePage={(page) => {
              setFilters({ page })
            }}
          />
        </>
      )}
    </>
  )
}
