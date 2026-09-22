import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse, delay } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from '../src/App'
import { createQueryClient } from '../src/lib/queryClient'
import { API_URL, apiServer, buildUser, buildUserList } from './helpers/api-server'

beforeAll(() => {
  apiServer.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  apiServer.resetHandlers()
})

afterAll(() => {
  apiServer.close()
})

const USER_ID = '63f1ea59-25ad-41ab-8437-b8c00bed9031'

function renderAt(route: string) {
  return render(
    <QueryClientProvider client={createQueryClient({ queries: { retry: false } })}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function mockUser(overrides = {}): void {
  apiServer.use(
    http.get(`${API_URL}/users/:id`, () =>
      HttpResponse.json(
        buildUser({
          id: USER_ID,
          name: 'Ana Souza',
          email: 'Ana.Souza@Exemplo.com',
          phone: '(11) 90000-0000',
          ...overrides,
        }),
      ),
    ),
  )
}

describe('exibição dos dados', () => {
  it('mostra todos os campos do contrato', async () => {
    mockUser()
    renderAt(`/users/${USER_ID}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Souza' })).toBeInTheDocument()
    expect(screen.getByText('(11) 90000-0000')).toBeInTheDocument()
    expect(screen.getByText(USER_ID)).toBeInTheDocument()
  })

  it('preserva a caixa original do email', async () => {
    mockUser()
    renderAt(`/users/${USER_ID}`)

    expect(await screen.findByRole('link', { name: 'Ana.Souza@Exemplo.com' })).toBeInTheDocument()
  })

  it('o email é acionável por mailto', async () => {
    mockUser()
    renderAt(`/users/${USER_ID}`)

    expect(await screen.findByRole('link', { name: /ana.souza@exemplo.com/i })).toHaveAttribute(
      'href',
      'mailto:Ana.Souza@Exemplo.com',
    )
  })

  it('telefone ausente é informado como tal, não deixado em branco', async () => {
    mockUser({ phone: null })
    renderAt(`/users/${USER_ID}`)

    expect(await screen.findByText(/não informado/i)).toBeInTheDocument()
  })

  it('as datas aparecem em formato legível, com valor legível por máquina', async () => {
    mockUser({ createdAt: '2026-09-22T15:30:00.000Z' })
    const { container } = renderAt(`/users/${USER_ID}`)

    await screen.findByRole('heading', { level: 1, name: 'Ana Souza' })

    expect(container.querySelector('time[datetime="2026-09-22T15:30:00.000Z"]')).not.toBeNull()
  })

  it('oferece os caminhos para editar e voltar', async () => {
    mockUser()
    renderAt(`/users/${USER_ID}`)

    expect(await screen.findByRole('link', { name: /editar/i })).toHaveAttribute(
      'href',
      `/users/${USER_ID}/edit`,
    )
    expect(screen.getByRole('link', { name: /voltar para a listagem/i })).toBeInTheDocument()
  })

  it('usuário inexistente mostra erro sem oferecer repetição inútil', async () => {
    apiServer.use(
      http.get(`${API_URL}/users/:id`, () =>
        HttpResponse.json(
          { error: { code: 'USER_NOT_FOUND', message: 'Usuário não encontrado.' } },
          { status: 404 },
        ),
      ),
    )
    renderAt(`/users/${USER_ID}`)

    expect(await screen.findByRole('alert')).toHaveTextContent(/não encontrado/i)
    // Repetir um 404 não muda o resultado.
    expect(screen.queryByRole('button', { name: /tentar novamente/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /voltar para a listagem/i })).toBeInTheDocument()
  })
})

/*
 * O aceite proíbe `window.confirm`: o diálogo nativo não pode ser estilizado
 * nem traduzido, bloqueia a thread do navegador e trava automação — o teste
 * ponta a ponta do M8 não conseguiria passar por ele.
 */
describe('confirmação de exclusão', () => {
  it('não remove ao primeiro clique', async () => {
    const user = userEvent.setup()
    let deleteWasCalled = false
    mockUser()
    apiServer.use(
      http.delete(`${API_URL}/users/:id`, () => {
        deleteWasCalled = true

        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderAt(`/users/${USER_ID}`)

    await user.click(await screen.findByRole('button', { name: 'Excluir' }))

    expect(deleteWasCalled).toBe(false)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('a confirmação é um elemento da própria interface', async () => {
    const user = userEvent.setup()
    mockUser()
    renderAt(`/users/${USER_ID}`)

    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    const dialog = screen.getByRole('alertdialog')

    expect(dialog).toHaveAccessibleName(/excluir este usuário/i)
    expect(dialog).toHaveAccessibleDescription(/não pode ser desfeita/i)
  })

  it('a confirmação identifica quem será removido', async () => {
    const user = userEvent.setup()
    mockUser()
    renderAt(`/users/${USER_ID}`)

    await user.click(await screen.findByRole('button', { name: 'Excluir' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent(/Ana Souza/)
  })

  it('o foco vai para o botão de confirmar', async () => {
    const user = userEvent.setup()
    mockUser()
    renderAt(`/users/${USER_ID}`)

    await user.click(await screen.findByRole('button', { name: 'Excluir' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sim, excluir/i })).toHaveFocus()
    })
  })

  it('cancelar fecha a confirmação sem remover', async () => {
    const user = userEvent.setup()
    let deleteWasCalled = false
    mockUser()
    apiServer.use(
      http.delete(`${API_URL}/users/:id`, () => {
        deleteWasCalled = true

        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderAt(`/users/${USER_ID}`)

    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(deleteWasCalled).toBe(false)
  })

  it('Escape cancela, como em qualquer diálogo', async () => {
    const user = userEvent.setup()
    mockUser()
    renderAt(`/users/${USER_ID}`)

    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })

  it('bloqueia o botão durante a exclusão, evitando duplo envio', async () => {
    const user = userEvent.setup()
    mockUser()
    apiServer.use(
      http.delete(`${API_URL}/users/:id`, async () => {
        await delay(300)

        return new HttpResponse(null, { status: 204 })
      }),
      http.get(`${API_URL}/users`, () => HttpResponse.json(buildUserList([]))),
    )
    renderAt(`/users/${USER_ID}`)

    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: /sim, excluir/i }))

    expect(await screen.findByRole('button', { name: /excluindo/i })).toBeDisabled()
  })

  it('falha ao excluir é anunciada sem sair da tela', async () => {
    const user = userEvent.setup()
    mockUser()
    apiServer.use(
      http.delete(`${API_URL}/users/:id`, () => new HttpResponse(null, { status: 503 })),
    )
    renderAt(`/users/${USER_ID}`)

    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: /sim, excluir/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/servidor/i)
    expect(screen.getByRole('heading', { level: 1, name: 'Ana Souza' })).toBeInTheDocument()
  })
})

/*
 * Sem preservar a origem, excluir a partir de uma busca filtrada devolveria a
 * pessoa à listagem sem filtro, obrigando-a a refazer a busca.
 */
describe('retorno à listagem preserva os filtros', () => {
  function mockList(): void {
    apiServer.use(
      http.get(`${API_URL}/users`, () =>
        HttpResponse.json(buildUserList([buildUser({ id: USER_ID, name: 'Ana Souza' })])),
      ),
    )
  }

  it('o link do detalhe carrega a query da listagem de origem', async () => {
    const user = userEvent.setup()
    mockList()
    mockUser()
    renderAt('/users?search=souza&page=2')

    await user.click(await screen.findByRole('link', { name: 'Ana Souza' }))

    const backLink = await screen.findByRole('link', { name: /voltar para a listagem/i })
    expect(backLink).toHaveAttribute('href', '/users?search=souza&page=2')
  })

  it('excluir devolve à listagem com a mesma busca', async () => {
    const user = userEvent.setup()
    mockList()
    mockUser()
    apiServer.use(
      http.delete(`${API_URL}/users/:id`, () => new HttpResponse(null, { status: 204 })),
    )
    renderAt('/users?search=souza')

    await user.click(await screen.findByRole('link', { name: 'Ana Souza' }))
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: /sim, excluir/i }))

    // De volta na listagem, com o campo de busca ainda preenchido.
    expect(await screen.findByRole('searchbox', { name: /buscar/i })).toHaveValue('souza')
  })

  it('aberto por link direto, o retorno é para a listagem sem filtro', async () => {
    mockUser()
    renderAt(`/users/${USER_ID}`)

    const backLink = await screen.findByRole('link', { name: /voltar para a listagem/i })

    expect(backLink).toHaveAttribute('href', '/users')
  })
})
