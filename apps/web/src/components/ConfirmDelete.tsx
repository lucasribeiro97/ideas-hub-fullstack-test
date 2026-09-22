import { useEffect, useRef } from 'react'

interface ConfirmDeleteProps {
  description: string
  isDeleting: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmação de exclusão embutida na própria tela.
 *
 * Deliberadamente não usa `window.confirm`. O diálogo nativo não pode ser
 * estilizado, não é traduzível, bloqueia a thread do navegador e trava
 * automação — o teste ponta a ponta do M8 não conseguiria passar por ele.
 *
 * Não é modal: a confirmação aparece no lugar dos botões, o que dispensa
 * aprisionamento de foco e evita a classe de problemas de acessibilidade que
 * modais mal feitos introduzem. O foco vai para o botão de confirmar, e
 * `role="alertdialog"` faz o leitor de tela anunciar a pergunta.
 */
export function ConfirmDelete({
  description,
  isDeleting,
  onConfirm,
  onCancel,
}: ConfirmDeleteProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  return (
    <div
      className="confirm"
      role="alertdialog"
      aria-labelledby="confirmar-titulo"
      aria-describedby="confirmar-descricao"
      onKeyDown={(event) => {
        // Escape cancela, como em qualquer diálogo.
        if (event.key === 'Escape') onCancel()
      }}
    >
      <h2 className="confirm__title" id="confirmar-titulo">
        Excluir este usuário?
      </h2>
      <p className="confirm__description" id="confirmar-descricao">
        {description} Esta ação não pode ser desfeita.
      </p>
      <div className="confirm__actions">
        <button
          type="button"
          className="button button--danger"
          ref={confirmRef}
          onClick={onConfirm}
          disabled={isDeleting}
        >
          {isDeleting ? 'Excluindo…' : 'Sim, excluir'}
        </button>
        <button type="button" className="button" onClick={onCancel} disabled={isDeleting}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
