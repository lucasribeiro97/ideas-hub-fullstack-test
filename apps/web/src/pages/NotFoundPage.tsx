import { Link } from 'react-router-dom'
import { PageHeading } from '../components/PageHeading.tsx'

export function NotFoundPage() {
  return (
    <>
      <PageHeading title="Página não encontrada" />
      <p>
        O endereço acessado não existe. Talvez o link esteja desatualizado.
      </p>
      <p>
        <Link to="/users">Voltar para a listagem de usuários</Link>
      </p>
    </>
  )
}
