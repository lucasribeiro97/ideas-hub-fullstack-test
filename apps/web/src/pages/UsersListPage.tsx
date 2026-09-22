import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState.tsx'
import { ErrorState } from '../components/ErrorState.tsx'
import { PageHeading } from '../components/PageHeading.tsx'
import { Pagination } from '../components/Pagination.tsx'
import { TableSkeleton } from '../components/TableSkeleton.tsx'
import { UsersTable } from '../components/UsersTable.tsx'
import { useSearchInput } from '../hooks/useSearchInput.ts'
import { useUsers } from '../hooks/useUsers.ts'
import { useUsersFilters } from '../hooks/useUsersFilters.ts'
import { PER_PAGE_OPTIONS } from '../lib/userFilters.ts'

export function UsersListPage() {
  const { filters, setFilters, toggleSort } = useUsersFilters()
  const { inputValue, setInputValue } = useSearchInput({
    value: filters.search,
    onDebouncedChange: (search) => {
      setFilters({ search })
    },
  })
  const { data, isPending, isError, error, isFetching, isPlaceholderData, refetch } =
    useUsers(filters)

  const hasSearch = filters.search.length > 0
  const isEmpty = data !== undefined && data.data.length === 0

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
            value={inputValue}
            placeholder="ex.: souza"
            onChange={(event) => {
              setInputValue(event.target.value)
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

      {/*
        A região inteira é anunciada como ocupada durante qualquer busca. O
        texto de situação vive aqui para que a mudança seja falada uma vez, em
        vez de a cada elemento que entra e sai da tela.
      */}
      <div aria-busy={isFetching} aria-live="polite" className="list-status">
        {isPending && 'Carregando usuários…'}
        {isPlaceholderData && 'Atualizando resultados…'}
      </div>

      {isPending && <TableSkeleton />}

      {isError && (
        <ErrorState
          error={error}
          onRetry={() => {
            void refetch()
          }}
        />
      )}

      {data !== undefined && (
        <>
          {isEmpty ? (
            hasSearch ? (
              <EmptyState
                title="Nenhum usuário encontrado"
                description={`A busca por "${filters.search}" não retornou resultados. Verifique a grafia ou tente um termo mais curto.`}
                action={
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      setFilters({ search: '' })
                    }}
                  >
                    Limpar busca
                  </button>
                }
              />
            ) : (
              /* Base vazia e busca sem resultado são situações diferentes: a
                 primeira pede para cadastrar alguém, a segunda para revisar o
                 termo. Oferecer "limpar busca" numa base vazia não ajudaria. */
              <EmptyState
                title="Nenhum usuário cadastrado"
                description="Cadastre o primeiro usuário ou importe a base a partir do CSV de origem."
                action={
                  <Link className="button button--primary" to="/users/new">
                    Cadastrar usuário
                  </Link>
                }
              />
            )
          ) : (
            <div className={isPlaceholderData ? 'is-stale' : undefined}>
              <UsersTable users={data.data} filters={filters} onToggleSort={toggleSort} />
            </div>
          )}

          {!isEmpty && (
            <Pagination
              meta={data.meta}
              disabled={isPlaceholderData}
              onChangePage={(page) => {
                setFilters({ page })
              }}
            />
          )}
        </>
      )}
    </>
  )
}
