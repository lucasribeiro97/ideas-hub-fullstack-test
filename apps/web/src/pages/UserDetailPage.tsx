import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { deleteUser, getUser } from '../api/users.ts'
import { ConfirmDelete } from '../components/ConfirmDelete.tsx'
import { ErrorState } from '../components/ErrorState.tsx'
import { PageHeading } from '../components/PageHeading.tsx'
import { InlineError } from '../components/InlineError.tsx'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'long',
  timeStyle: 'short',
})

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso))
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [isConfirming, setIsConfirming] = useState(false)
  const [wasDeleted, setWasDeleted] = useState(false)

  /**
   * Query string da listagem de onde se veio.
   *
   * Sem isso, excluir a partir de uma busca filtrada devolveria a pessoa à
   * listagem sem filtro, e ela teria que refazer a busca para continuar de
   * onde estava. Quando a tela é aberta por link direto não há origem, e o
   * retorno é para a listagem limpa.
   */
  const listSearch = (location.state as { from?: string } | null)?.from ?? ''
  const listUrl = `/users${listSearch}`

  const { data: user, isPending, isError, error, refetch } = useQuery({
    queryKey: ['user', id],
    queryFn: ({ signal }) => getUser(id as string, { signal }),
    /*
     * Desligada assim que a exclusão conclui.
     *
     * Entre o fim da exclusão e a navegação sair desta tela existe um
     * intervalo em que o componente continua montado. Sem esta guarda, limpar
     * a entrada do cache faz o TanStack Query buscar o registro de novo — e
     * receber 404, porque ele acabou de ser removido. A requisição não afeta o
     * resultado, mas aparece como falha no painel de rede e polui o log do
     * servidor com um erro que não é erro.
     */
    enabled: !wasDeleted,
  })

  const removal = useMutation({
    mutationFn: () => deleteUser(id as string),
    onSuccess: () => {
      // Antes de mexer no cache: impede que a consulta desta tela reaja à
      // limpeza buscando um registro que não existe mais.
      setWasDeleted(true)

      void queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.removeQueries({ queryKey: ['user', id] })
      // `replace` impede que o botão Voltar traga de volta o detalhe de um
      // usuário que não existe mais.
      void navigate(listUrl, { replace: true })
    },
  })

  if (isPending) {
    return (
      <>
        <PageHeading title="Detalhes do usuário" />
        <p aria-live="polite">Carregando usuário…</p>
      </>
    )
  }

  if (isError) {
    return (
      <>
        <PageHeading title="Detalhes do usuário" />
        <ErrorState
          error={error}
          onRetry={() => {
            void refetch()
          }}
        />
        <p>
          <Link to={listUrl}>Voltar para a listagem</Link>
        </p>
      </>
    )
  }

  return (
    <>
      <PageHeading
        title={user.name}
        description="Dados cadastrais do usuário."
        actions={
          !isConfirming && (
            <>
              <Link className="button" to={`/users/${user.id}/edit`}>
                Editar
              </Link>
              <button
                type="button"
                className="button button--danger"
                onClick={() => {
                  setIsConfirming(true)
                }}
              >
                Excluir
              </button>
            </>
          )
        }
      />

      <p className="breadcrumb">
        <Link to={listUrl}>← Voltar para a listagem</Link>
      </p>

      {isConfirming && (
        <ConfirmDelete
          description={`${user.name} (${user.email}) será removido permanentemente.`}
          isDeleting={removal.isPending}
          onConfirm={() => {
            removal.mutate()
          }}
          onCancel={() => {
            setIsConfirming(false)
          }}
        />
      )}

      {removal.isError && <InlineError error={removal.error} />}

      {/* Lista de definição: a relação rótulo-valor é semântica, e um leitor
          de tela anuncia os pares em vez de um texto corrido. */}
      <dl className="details">
        <dt>Nome</dt>
        <dd>{user.name}</dd>

        <dt>Email</dt>
        <dd>
          <a href={`mailto:${user.email}`}>{user.email}</a>
        </dd>

        <dt>Telefone</dt>
        <dd>{user.phone ?? <span className="text-muted">Não informado</span>}</dd>

        <dt>Cadastrado em</dt>
        <dd>
          <time dateTime={user.createdAt}>{formatDate(user.createdAt)}</time>
        </dd>

        <dt>Última atualização</dt>
        <dd>
          <time dateTime={user.updatedAt}>{formatDate(user.updatedAt)}</time>
        </dd>

        <dt>Identificador</dt>
        <dd>
          <code>{user.id}</code>
        </dd>
      </dl>
    </>
  )
}
