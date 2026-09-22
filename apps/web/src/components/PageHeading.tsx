import { useDocumentTitle } from '../hooks/useDocumentTitle.ts'

interface PageHeadingProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

/**
 * Título da página.
 *
 * Mantém juntos o `h1` visível e o título do documento: eram duas coisas
 * fáceis de deixar divergentes se atualizadas em lugares separados.
 */
export function PageHeading({ title, description, actions }: PageHeadingProps) {
  useDocumentTitle(title)

  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description !== undefined && <p className="page-heading__description">{description}</p>}
      </div>
      {actions !== undefined && <div className="page-heading__actions">{actions}</div>}
    </div>
  )
}
