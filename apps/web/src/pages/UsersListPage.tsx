import { Link } from 'react-router-dom'
import { PageHeading } from '../components/PageHeading.tsx'

/** Conteúdo real chega na TASK-WEB-03. */
export function UsersListPage() {
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
      <p>Listagem em construção.</p>
    </>
  )
}
