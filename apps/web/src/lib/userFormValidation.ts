import { ApiError } from '../api/client.ts'

/*
 * Limites iguais aos da API (SPEC §6).
 *
 * Redeclarados aqui porque os apps são pacotes independentes (SPEC §4). Se
 * divergissem, o formulário aceitaria um valor que o servidor recusaria — e a
 * pessoa só descobriria depois de preencher tudo e enviar.
 */
export const MAX_NAME = 120
export const MAX_EMAIL = 254
export const MAX_PHONE = 30

export interface UserFormValues {
  name: string
  email: string
  phone: string
}

export type FieldErrors = Partial<Record<keyof UserFormValues, string>>

export const EMPTY_FORM: UserFormValues = { name: '', email: '', phone: '' }

/**
 * Validação no cliente, antes de enviar.
 *
 * Não substitui a do servidor — ela continua sendo a autoridade, e o servidor
 * é quem enxerga o estado do banco. O que a validação aqui evita é a viagem de
 * ida e volta para um erro que dava para ver na hora.
 *
 * Aceita deliberadamente menos que a RFC de email: um padrão exaustivo recusa
 * endereços válidos e raros, e o servidor faz a verificação final de qualquer
 * forma.
 */
export function validateUserForm(values: UserFormValues): FieldErrors {
  const errors: FieldErrors = {}

  const name = values.name.trim()
  if (name.length === 0) errors.name = 'Informe o nome.'
  else if (name.length > MAX_NAME) errors.name = `O nome deve ter no máximo ${MAX_NAME} caracteres.`

  const email = values.email.trim()
  if (email.length === 0) errors.email = 'Informe o email.'
  else if (email.length > MAX_EMAIL)
    errors.email = `O email deve ter no máximo ${MAX_EMAIL} caracteres.`
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = 'Informe um email válido, como nome@exemplo.com.'

  if (values.phone.trim().length > MAX_PHONE)
    errors.phone = `O telefone deve ter no máximo ${MAX_PHONE} caracteres.`

  return errors
}

/**
 * Converte o erro da API em erros por campo.
 *
 * O conflito de email é o caso que justifica isto: a resposta 409 não traz
 * `details`, porque o servidor não está apontando um campo malformado — está
 * dizendo que aquele valor já pertence a outra pessoa. Sem o mapeamento
 * explícito, a mensagem apareceria como erro genérico no topo e quem preencheu
 * teria que adivinhar qual campo corrigir.
 *
 * Devolve `undefined` quando o erro não pertence a nenhum campo, e nesse caso
 * a tela mostra a mensagem geral.
 */
export function toFieldErrors(error: unknown): FieldErrors | undefined {
  if (!(error instanceof ApiError)) return undefined

  if (error.code === 'USER_EMAIL_TAKEN') {
    return { email: 'Este email já está cadastrado para outro usuário.' }
  }

  if (error.code === 'VALIDATION_ERROR' && error.details !== undefined) {
    const mapped: FieldErrors = {}

    for (const detail of error.details) {
      if (detail.field === 'name' || detail.field === 'email' || detail.field === 'phone') {
        mapped[detail.field] = detail.message
      }
    }

    return Object.keys(mapped).length > 0 ? mapped : undefined
  }

  return undefined
}

/** Ordem dos campos no formulário, usada para focar o primeiro com erro. */
export const FIELD_ORDER: (keyof UserFormValues)[] = ['name', 'email', 'phone']

export function firstFieldWithError(errors: FieldErrors): keyof UserFormValues | undefined {
  return FIELD_ORDER.find((field) => errors[field] !== undefined)
}
