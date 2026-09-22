import { describeError } from '../lib/describeError.ts'

interface ErrorStateProps {
  error: unknown
  onRetry?: () => void
}

/**
 * Falha com caminho de saída.
 *
 * `role="alert"` faz o leitor de tela anunciar o erro assim que ele aparece —
 * sem isso, quem não está olhando para a região não fica sabendo que a
 * operação falhou.
 *
 * O botão de repetir só aparece quando repetir tem chance de resolver.
 * Oferecê-lo num 404 seria enganoso.
 */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const { title, description, canRetry } = describeError(error)

  return (
    <div className="state state--error" role="alert">
      <h2 className="state__title">{title}</h2>
      <p className="state__description">{description}</p>
      {canRetry && onRetry !== undefined && (
        <button type="button" className="button" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  )
}
