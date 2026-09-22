import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse, delay } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from '../src/App'
import { createQueryClient } from '../src/lib/queryClient'
import {
  EMPTY_FORM,
  firstFieldWithError,
  toFieldErrors,
  validateUserForm,
} from '../src/lib/userFormValidation'
import { ApiError } from '../src/api/client'
import { API_URL, apiServer, buildUser } from './helpers/api-server'

beforeAll(() => {
  apiServer.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  apiServer.resetHandlers()
})

afterAll(() => {
  apiServer.close()
})

function renderAt(route: string) {
  return render(
    <QueryClientProvider client={createQueryClient({ queries: { retry: false } })}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const USER_ID = '63f1ea59-25ad-41ab-8437-b8c00bed9031'

describe('validateUserForm', () => {
  it('aceita um preenchimento válido', () => {
    expect(
      validateUserForm({ name: 'Ana Souza', email: 'ana@exemplo.com', phone: '' }),
    ).toEqual({})
  })

  it.each([
    ['nome vazio', { ...EMPTY_FORM, email: 'a@b.com' }, 'name'],
    ['nome só com espaços', { name: '   ', email: 'a@b.com', phone: '' }, 'name'],
    ['email vazio', { ...EMPTY_FORM, name: 'Ana' }, 'email'],
    ['email sem arroba', { name: 'Ana', email: 'nao-e-email', phone: '' }, 'email'],
    ['email sem domínio', { name: 'Ana', email: 'ana@', phone: '' }, 'email'],
  ])('acusa %s', (_case, values, field) => {
    expect(validateUserForm(values)[field as 'name']).toBeDefined()
  })

  it('acusa nome acima do limite', () => {
    const errors = validateUserForm({ name: 'a'.repeat(121), email: 'a@b.com', phone: '' })

    expect(errors.name).toContain('120')
  })

  it('telefone é opcional', () => {
    expect(validateUserForm({ name: 'Ana', email: 'a@b.com', phone: '' }).phone).toBeUndefined()
  })

  it('acusa telefone acima do limite', () => {
    const errors = validateUserForm({ name: 'Ana', email: 'a@b.com', phone: '9'.repeat(31) })

    expect(errors.phone).toContain('30')
  })

  it('aponta o primeiro campo com erro na ordem do formulário', () => {
    const errors = validateUserForm(EMPTY_FORM)

    expect(firstFieldWithError(errors)).toBe('name')
  })
})

/*
 * O conflito de email é o caso que justifica o mapeamento: a resposta 409 não
 * traz `details`, porque o servidor não aponta um campo malformado — diz que o
 * valor pertence a outra pessoa. Sem isso, a mensagem apareceria genérica no
 * topo e quem preencheu teria que adivinhar qual campo corrigir.
 */
describe('toFieldErrors', () => {
  it('mapeia o conflito de email para o campo de email', () => {
    const errors = toFieldErrors(new ApiError(409, 'USER_EMAIL_TAKEN', 'Já existe…'))

    expect(errors?.email).toContain('já está cadastrado')
  })

  it('mapeia os detalhes de validação para os campos correspondentes', () => {
    const errors = toFieldErrors(
      new ApiError(422, 'VALIDATION_ERROR', 'Dados inválidos.', [
        { field: 'name', message: 'nome é obrigatório' },
        { field: 'email', message: 'email inválido' },
      ]),
    )

    expect(errors).toEqual({ name: 'nome é obrigatório', email: 'email inválido' })
  })

  it('ignora detalhes de campos que o formulário não tem', () => {
    const errors = toFieldErrors(
      new ApiError(422, 'VALIDATION_ERROR', 'x', [{ field: 'id', message: 'inválido' }]),
    )

    expect(errors).toBeUndefined()
  })

  it('erro sem relação com campo não vira erro de campo', () => {
    expect(toFieldErrors(new ApiError(503, 'X', 'y'))).toBeUndefined()
    expect(toFieldErrors(new Error('qualquer'))).toBeUndefined()
  })
})

describe('cadastro', () => {
  it('envia os dados preenchidos', async () => {
    const user = userEvent.setup()
    let body: unknown
    apiServer.use(
      http.post(`${API_URL}/users`, async ({ request }) => {
        body = await request.json()

        return HttpResponse.json(buildUser({ id: USER_ID }), { status: 201 })
      }),
      http.get(`${API_URL}/users/:id`, () => HttpResponse.json(buildUser({ id: USER_ID }))),
    )
    renderAt('/users/new')

    await user.type(screen.getByLabelText(/nome/i), 'Ana Souza')
    await user.type(screen.getByLabelText(/email/i), 'ana@exemplo.com')
    await user.type(screen.getByLabelText(/telefone/i), '(11) 90000-0000')
    await user.click(screen.getByRole('button', { name: /cadastrar/i }))

    await waitFor(() => {
      expect(body).toEqual({
        name: 'Ana Souza',
        email: 'ana@exemplo.com',
        phone: '(11) 90000-0000',
      })
    })
  })

  it('telefone em branco é enviado como ausência, não como texto vazio', async () => {
    const user = userEvent.setup()
    let body: { phone: string | null } | undefined
    apiServer.use(
      http.post(`${API_URL}/users`, async ({ request }) => {
        body = (await request.json()) as { phone: string | null }

        return HttpResponse.json(buildUser({ id: USER_ID }), { status: 201 })
      }),
      http.get(`${API_URL}/users/:id`, () => HttpResponse.json(buildUser({ id: USER_ID }))),
    )
    renderAt('/users/new')

    await user.type(screen.getByLabelText(/nome/i), 'Ana Souza')
    await user.type(screen.getByLabelText(/email/i), 'ana@exemplo.com')
    await user.click(screen.getByRole('button', { name: /cadastrar/i }))

    await waitFor(() => {
      expect(body?.phone).toBeNull()
    })
  })

  it('leva ao detalhe do usuário criado', async () => {
    const user = userEvent.setup()
    apiServer.use(
      http.post(`${API_URL}/users`, () =>
        HttpResponse.json(buildUser({ id: USER_ID, name: 'Ana Souza' }), { status: 201 }),
      ),
      http.get(`${API_URL}/users/:id`, () =>
        HttpResponse.json(buildUser({ id: USER_ID, name: 'Ana Souza' })),
      ),
    )
    renderAt('/users/new')

    await user.type(screen.getByLabelText(/nome/i), 'Ana Souza')
    await user.type(screen.getByLabelText(/email/i), 'ana@exemplo.com')
    await user.click(screen.getByRole('button', { name: /cadastrar/i }))

    /*
     * O título esperado é o nome do usuário, que a tela de detalhe só mostra
     * depois de ter o registro.
     *
     * Antes, este caso esperava por "Detalhes do usuário" — que é o título das
     * telas de carregando e de erro. Ele passava vendo a tela de espera e
     * teria continuado passando se a busca do registro falhasse logo em
     * seguida. A troca só apareceu quando a resposta do cadastro passou a
     * semear o cache: sem carregamento, não havia mais tela de espera para
     * encontrar.
     */
    expect(await screen.findByRole('heading', { name: 'Ana Souza' })).toBeInTheDocument()
  })
})

describe('validação antes do envio', () => {
  it('não chama a API quando há campo inválido', async () => {
    const user = userEvent.setup()
    let wasCalled = false
    apiServer.use(
      http.post(`${API_URL}/users`, () => {
        wasCalled = true

        return HttpResponse.json(buildUser(), { status: 201 })
      }),
    )
    renderAt('/users/new')

    await user.click(screen.getByRole('button', { name: /cadastrar/i }))

    expect(await screen.findByText(/informe o nome/i)).toBeInTheDocument()
    expect(wasCalled).toBe(false)
  })

  it('a mensagem é ligada ao campo para leitor de tela', async () => {
    const user = userEvent.setup()
    renderAt('/users/new')

    await user.click(screen.getByRole('button', { name: /cadastrar/i }))

    const nameField = screen.getByLabelText(/nome/i)
    expect(nameField).toHaveAttribute('aria-invalid', 'true')
    expect(nameField).toHaveAccessibleDescription(/informe o nome/i)
  })

  // Sem o foco, quem navega por teclado tem que procurar onde está o erro.
  it('o foco vai para o primeiro campo com problema', async () => {
    const user = userEvent.setup()
    renderAt('/users/new')

    await user.click(screen.getByRole('button', { name: /cadastrar/i }))

    expect(screen.getByLabelText(/nome/i)).toHaveFocus()
  })

  // Acusar erro enquanto a pessoa ainda está preenchendo pela primeira vez é
  // hostil: ela vê "informe o email" antes de ter chance de digitá-lo.
  it('não acusa erro antes da primeira tentativa de envio', async () => {
    const user = userEvent.setup()
    renderAt('/users/new')

    await user.click(screen.getByLabelText(/nome/i))
    await user.tab()

    expect(screen.queryByText(/informe o nome/i)).not.toBeInTheDocument()
  })

  it('depois de tentar enviar, corrigir o campo limpa o erro', async () => {
    const user = userEvent.setup()
    apiServer.use(
      http.post(`${API_URL}/users`, () => HttpResponse.json(buildUser(), { status: 201 })),
      http.get(`${API_URL}/users/:id`, () => HttpResponse.json(buildUser())),
    )
    renderAt('/users/new')

    await user.click(screen.getByRole('button', { name: /cadastrar/i }))
    expect(await screen.findByText(/informe o nome/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/nome/i), 'Ana Souza')
    await user.tab()

    await waitFor(() => {
      expect(screen.queryByText(/informe o nome/i)).not.toBeInTheDocument()
    })
  })
})

/*
 * O ponto central do aceite da TASK-WEB-06.
 */
describe('conflito de email vindo do servidor', () => {
  function mockConflict(): void {
    apiServer.use(
      http.post(`${API_URL}/users`, () =>
        HttpResponse.json(
          { error: { code: 'USER_EMAIL_TAKEN', message: 'Já existe um usuário com este email.' } },
          { status: 409 },
        ),
      ),
    )
  }

  async function submitValid(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.type(screen.getByLabelText(/nome/i), 'Ana Souza')
    await user.type(screen.getByLabelText(/email/i), 'ana@exemplo.com')
    await user.click(screen.getByRole('button', { name: /cadastrar/i }))
  }

  it('a mensagem aparece no campo de email, e não solta no topo', async () => {
    const user = userEvent.setup()
    mockConflict()
    renderAt('/users/new')

    await submitValid(user)

    const emailField = await screen.findByLabelText(/email/i)
    await waitFor(() => {
      expect(emailField).toHaveAttribute('aria-invalid', 'true')
    })
    expect(emailField).toHaveAccessibleDescription(/já está cadastrado/i)
  })

  it('o campo de nome não é marcado como inválido', async () => {
    const user = userEvent.setup()
    mockConflict()
    renderAt('/users/new')

    await submitValid(user)

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true')
    })
    expect(screen.getByLabelText(/nome/i)).toHaveAttribute('aria-invalid', 'false')
  })

  it('os dados preenchidos são preservados', async () => {
    const user = userEvent.setup()
    mockConflict()
    renderAt('/users/new')

    await submitValid(user)

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true')
    })
    expect(screen.getByLabelText(/nome/i)).toHaveValue('Ana Souza')
  })

  it('a tela permanece no formulário', async () => {
    const user = userEvent.setup()
    mockConflict()
    renderAt('/users/new')

    await submitValid(user)

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true')
    })
    expect(screen.getByRole('heading', { name: /novo usuário/i })).toBeInTheDocument()
  })
})

describe('envio em andamento', () => {
  it('bloqueia o botão enquanto salva, evitando envio duplicado', async () => {
    const user = userEvent.setup()
    apiServer.use(
      http.post(`${API_URL}/users`, async () => {
        await delay(300)

        return HttpResponse.json(buildUser({ id: USER_ID }), { status: 201 })
      }),
      http.get(`${API_URL}/users/:id`, () => HttpResponse.json(buildUser({ id: USER_ID }))),
    )
    renderAt('/users/new')

    await user.type(screen.getByLabelText(/nome/i), 'Ana Souza')
    await user.type(screen.getByLabelText(/email/i), 'ana@exemplo.com')
    await user.click(screen.getByRole('button', { name: /cadastrar/i }))

    expect(await screen.findByRole('button', { name: /salvando/i })).toBeDisabled()
  })
})

describe('edição', () => {
  function mockUser(): void {
    apiServer.use(
      http.get(`${API_URL}/users/:id`, () =>
        HttpResponse.json(
          buildUser({ id: USER_ID, name: 'Ana Souza', email: 'ana@exemplo.com', phone: '(11) 9' }),
        ),
      ),
    )
  }

  it('preenche o formulário com os dados atuais', async () => {
    mockUser()
    renderAt(`/users/${USER_ID}/edit`)

    expect(await screen.findByLabelText(/nome/i)).toHaveValue('Ana Souza')
    expect(screen.getByLabelText(/email/i)).toHaveValue('ana@exemplo.com')
    expect(screen.getByLabelText(/telefone/i)).toHaveValue('(11) 9')
  })

  it('envia apenas PATCH, preservando o identificador', async () => {
    const user = userEvent.setup()
    let method = ''
    mockUser()
    apiServer.use(
      http.patch(`${API_URL}/users/:id`, ({ request }) => {
        method = request.method

        return HttpResponse.json(buildUser({ id: USER_ID, name: 'Ana S.' }))
      }),
    )
    renderAt(`/users/${USER_ID}/edit`)

    await user.clear(await screen.findByLabelText(/nome/i))
    await user.type(screen.getByLabelText(/nome/i), 'Ana S.')
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }))

    await waitFor(() => {
      expect(method).toBe('PATCH')
    })
  })

  it('usuário inexistente mostra erro em vez de formulário vazio', async () => {
    apiServer.use(
      http.get(`${API_URL}/users/:id`, () =>
        HttpResponse.json(
          { error: { code: 'USER_NOT_FOUND', message: 'Usuário não encontrado.' } },
          { status: 404 },
        ),
      ),
    )
    renderAt(`/users/${USER_ID}/edit`)

    expect(await screen.findByRole('alert')).toHaveTextContent(/não encontrado/i)
    expect(screen.queryByLabelText(/nome/i)).not.toBeInTheDocument()
  })
})
