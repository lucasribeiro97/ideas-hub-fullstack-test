import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { createUser, getUser, updateUser } from '../api/users.ts'
import type { User } from '../api/types.ts'
import { ErrorState } from '../components/ErrorState.tsx'
import { PageHeading } from '../components/PageHeading.tsx'
import { UserForm } from '../components/UserForm.tsx'
import { describeError } from '../lib/describeError.ts'
import { toFieldErrors, type UserFormValues } from '../lib/userFormValidation.ts'

interface UserFormPageProps {
  mode: 'create' | 'edit'
}

function toFormValues(user: User): UserFormValues {
  return { name: user.name, email: user.email, phone: user.phone ?? '' }
}

/**
 * Cadastro e edição compartilham a tela.
 *
 * Os dois formulários têm os mesmos campos e as mesmas validações; separá-los
 * duplicaria a lógica para variar apenas o título e o verbo do envio.
 */
export function UserFormPage({ mode }: UserFormPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = mode === 'edit'

  const existing = useQuery({
    queryKey: ['user', id],
    queryFn: ({ signal }) => getUser(id as string, { signal }),
    enabled: isEdit && id !== undefined,
  })

  const mutation = useMutation({
    mutationFn: (values: UserFormValues) => {
      const payload = {
        name: values.name.trim(),
        email: values.email.trim(),
        // Campo opcional em branco é ausência, não string vazia — mesma regra
        // aplicada pela API.
        phone: values.phone.trim().length > 0 ? values.phone.trim() : null,
      }

      return isEdit ? updateUser(id as string, payload) : createUser(payload)
    },
    onSuccess: (user) => {
      // A listagem e o detalhe passam a estar desatualizados; invalidar faz a
      // próxima visita buscar o dado novo em vez de mostrar o antigo.
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      void queryClient.invalidateQueries({ queryKey: ['user', user.id] })
      void navigate(`/users/${user.id}`, { replace: true })
    },
  })

  const serverFieldErrors = toFieldErrors(mutation.error)
  // Erro que não pertence a um campo vira mensagem geral; o que pertence já é
  // exibido junto do campo e repeti-lo no topo seria redundante.
  const generalError = mutation.isError && serverFieldErrors === undefined ? mutation.error : null

  const title = isEdit ? 'Editar usuário' : 'Novo usuário'

  if (isEdit && existing.isPending) {
    return (
      <>
        <PageHeading title={title} />
        <p aria-live="polite">Carregando usuário…</p>
      </>
    )
  }

  if (isEdit && existing.isError) {
    return (
      <>
        <PageHeading title={title} />
        <ErrorState
          error={existing.error}
          onRetry={() => {
            void existing.refetch()
          }}
        />
      </>
    )
  }

  return (
    <>
      <PageHeading
        title={title}
        description={
          isEdit
            ? 'Altere os dados e salve. O email precisa continuar único.'
            : 'Preencha os dados do novo usuário.'
        }
      />

      {generalError !== null && (
        <p className="form__general-error" role="alert">
          {describeError(generalError).description}
        </p>
      )}

      <UserForm
        initialValues={existing.data !== undefined ? toFormValues(existing.data) : undefined}
        submitLabel={isEdit ? 'Salvar alterações' : 'Cadastrar'}
        isSubmitting={mutation.isPending}
        serverErrors={serverFieldErrors}
        onSubmit={(values) => {
          mutation.mutate(values)
        }}
        onCancel={() => {
          void navigate(-1)
        }}
      />
    </>
  )
}
