interface EmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
}

/**
 * Ausência de resultados.
 *
 * Distinto do estado de erro de propósito: uma lista vazia é resultado
 * legítimo, não falha, e anunciá-la como alerta assustaria sem motivo.
 */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="state">
      <h2 className="state__title">{title}</h2>
      {description !== undefined && <p className="state__description">{description}</p>}
      {action !== undefined && <div className="state__action">{action}</div>}
    </div>
  )
}
