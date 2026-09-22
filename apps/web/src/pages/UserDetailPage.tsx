import { useParams } from 'react-router-dom'
import { PageHeading } from '../components/PageHeading.tsx'

/** Conteúdo real chega na TASK-WEB-07. */
export function UserDetailPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <>
      <PageHeading title="Detalhes do usuário" />
      <p>Detalhes de {id} em construção.</p>
    </>
  )
}
