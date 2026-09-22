import { useParams } from 'react-router-dom'
import { PageHeading } from '../components/PageHeading.tsx'

interface UserFormPageProps {
  mode: 'create' | 'edit'
}

/**
 * Cadastro e edição compartilham a tela.
 *
 * Os dois formulários têm os mesmos campos e as mesmas validações; separá-los
 * duplicaria a lógica para variar apenas o título e o verbo do envio.
 *
 * Conteúdo real chega na TASK-WEB-06.
 */
export function UserFormPage({ mode }: UserFormPageProps) {
  const { id } = useParams<{ id: string }>()
  const isEdit = mode === 'edit'

  return (
    <>
      <PageHeading title={isEdit ? 'Editar usuário' : 'Novo usuário'} />
      <p>Formulário de {isEdit ? `edição de ${id}` : 'cadastro'} em construção.</p>
    </>
  )
}
