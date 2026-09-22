import { useRef, useState } from 'react'
import {
  EMPTY_FORM,
  MAX_EMAIL,
  MAX_NAME,
  MAX_PHONE,
  firstFieldWithError,
  validateUserForm,
  type FieldErrors,
  type UserFormValues,
} from '../lib/userFormValidation.ts'

interface UserFormProps {
  initialValues?: UserFormValues
  submitLabel: string
  isSubmitting: boolean
  /** Erros por campo devolvidos pelo servidor, como o conflito de email. */
  serverErrors?: FieldErrors
  onSubmit: (values: UserFormValues) => void
  onCancel: () => void
}

const FIELDS = [
  {
    name: 'name' as const,
    label: 'Nome',
    type: 'text',
    required: true,
    maxLength: MAX_NAME,
    autoComplete: 'name',
  },
  {
    name: 'email' as const,
    label: 'Email',
    type: 'email',
    required: true,
    maxLength: MAX_EMAIL,
    autoComplete: 'email',
  },
  {
    name: 'phone' as const,
    label: 'Telefone',
    type: 'tel',
    required: false,
    maxLength: MAX_PHONE,
    autoComplete: 'tel',
  },
]

export function UserForm({
  initialValues = EMPTY_FORM,
  submitLabel,
  isSubmitting,
  serverErrors,
  onSubmit,
  onCancel,
}: UserFormProps) {
  const [values, setValues] = useState<UserFormValues>(initialValues)
  const [clientErrors, setClientErrors] = useState<FieldErrors>({})
  const [wasSubmitted, setWasSubmitted] = useState(false)
  const fieldRefs = useRef<Partial<Record<keyof UserFormValues, HTMLInputElement | null>>>({})

  // O erro do servidor tem prioridade: ele conhece o estado do banco, que a
  // validação local não tem como verificar.
  const errors: FieldErrors = { ...clientErrors, ...serverErrors }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    setWasSubmitted(true)

    const found = validateUserForm(values)
    setClientErrors(found)

    const firstInvalid = firstFieldWithError(found)
    if (firstInvalid !== undefined) {
      // Levar o foco ao primeiro campo com problema evita que quem navega por
      // teclado tenha que procurar onde está o erro (critério S14).
      fieldRefs.current[firstInvalid]?.focus()

      return
    }

    onSubmit(values)
  }

  return (
    <form className="user-form" onSubmit={handleSubmit} noValidate>
      {FIELDS.map((field) => {
        const error = errors[field.name]
        const errorId = `${field.name}-erro`

        return (
          <div className="field" key={field.name}>
            <label htmlFor={field.name}>
              {field.label}
              {field.required ? (
                <span aria-hidden="true"> *</span>
              ) : (
                <span className="field__optional"> (opcional)</span>
              )}
            </label>
            <input
              id={field.name}
              name={field.name}
              type={field.type}
              value={values[field.name]}
              maxLength={field.maxLength}
              autoComplete={field.autoComplete}
              required={field.required}
              // `aria-invalid` e `aria-describedby` são o que ligam a mensagem
              // ao campo para quem usa leitor de tela; a cor vermelha sozinha
              // não comunica nada.
              aria-invalid={error !== undefined}
              aria-describedby={error !== undefined ? errorId : undefined}
              ref={(element) => {
                fieldRefs.current[field.name] = element
              }}
              onChange={(event) => {
                setValues((current) => ({ ...current, [field.name]: event.target.value }))
              }}
              onBlur={() => {
                // Só valida ao sair do campo depois da primeira tentativa de
                // envio: acusar erro enquanto a pessoa ainda está preenchendo
                // pela primeira vez é hostil.
                if (wasSubmitted) setClientErrors(validateUserForm(values))
              }}
            />
            {error !== undefined && (
              <p className="field__error" id={errorId}>
                {error}
              </p>
            )}
          </div>
        )
      })}

      <p className="form__note">
        <span aria-hidden="true">*</span> Campos obrigatórios.
      </p>

      <div className="form__actions">
        <button type="submit" className="button button--primary" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando…' : submitLabel}
        </button>
        <button type="button" className="button" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
