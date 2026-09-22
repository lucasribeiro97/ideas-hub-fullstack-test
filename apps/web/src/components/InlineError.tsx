import { describeError } from '../lib/describeError.ts'

interface InlineErrorProps {
  error: unknown
}

/**
 * Falha de uma ação, exibida junto do formulário que a disparou.
 *
 * Mostra título e descrição. Só a descrição perderia a parte mais informativa
 * — "O servidor encontrou um problema" diz o que houve; "tente novamente em
 * instantes" diz o que fazer. As duas juntas é que orientam.
 *
 * Distinto do ErrorState, que substitui o conteúdo da tela: aqui a tela
 * continua utilizável e o aviso é sobre a ação que falhou.
 */
export function InlineError({ error }: InlineErrorProps) {
  const { title, description } = describeError(error)

  return (
    <p className="form__general-error" role="alert">
      <strong>{title}.</strong> {description}
    </p>
  )
}
