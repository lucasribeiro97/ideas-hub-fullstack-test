import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from '../src/App'
import { createQueryClient } from '../src/lib/queryClient'
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

/** Consultas capturadas, para verificar o que a tela pediu à API. */
let requestedQueries: string[] = []

function mockUsers(total = 3, perPageDefault = 20): void {
  requestedQueries = []

  apiServer.use(
    http.get(`${API_URL}/users`, ({ request }) => {
      const url = new URL(request.url)
      requestedQueries.push(url.search)

      const page = Number(url.searchParams.get('page') ?? '1')
      const perPage = Number(url.searchParams.get('perPage') ?? String(perPageDefault))
      const search = url.searchParams.get('search') ?? ''

      const matching = search.length > 0 ? Math.min(total, 2) : total
      const start = (page - 1) * perPage
      const count = Math.max(0, Math.min(perPage, matching - start))

      return HttpResponse.json({
        data: Array.from({ length: count }, (_unused, index) =>
          buildUser({
            id: `00000000-0000-4000-8000-${String(start + index).padStart(12, '0')}`,
            name: `Usuário ${start + index + 1}`,
            email: `usuario${start + index + 1}@exemplo.com`,
            phone: index === 0 ? '(11) 90000-0000' : null,
          }),
        ),
        meta: { page, perPage, total: matching, totalPages: Math.ceil(matching / perPage) },
      })
    }),
  )
}

function renderAt(route = '/users') {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('listagem de usuários', () => {
  it('mostra os usuários retornados pela API', async () => {
    mockUsers(3)
    renderAt()

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Usuário 1' })).toBeInTheDocument()
    expect(screen.getByText('usuario3@exemplo.com')).toBeInTheDocument()
  })

  it('mostra traço quando o telefone está ausente', async () => {
    mockUsers(2)
    renderAt()

    await screen.findByRole('table')
    const linhas = screen.getAllByRole('row')

    expect(within(linhas[2] as HTMLElement).getByText('—')).toBeInTheDocument()
  })

  it('o nome leva à tela de detalhe', async () => {
    mockUsers(1)
    renderAt()

    const link = await screen.findByRole('link', { name: 'Usuário 1' })

    expect(link).toHaveAttribute('href', '/users/00000000-0000-4000-8000-000000000000')
  })

  // A URL fica limpa (verificado em userFilters.test.ts); a requisição leva os
  // valores explícitos, que é o que torna o comportamento previsível
  // independentemente de mudança futura nos padrões da API.
  it('a primeira carga envia os filtros padrão explicitamente', async () => {
    mockUsers(1)
    renderAt()

    await screen.findByRole('table')

    expect(requestedQueries[0]).toContain('perPage=20')
    expect(requestedQueries[0]).toContain('sort=createdAt')
    expect(requestedQueries[0]).toContain('order=desc')
  })
})

/*
 * Critério S11: os filtros vivem na URL, e não em estado local. É o que faz
 * recarregar a página ou compartilhar o link preservar o contexto.
 */
describe('filtros vêm da URL', () => {
  it('a busca da URL aparece preenchida no campo', async () => {
    mockUsers(5)
    renderAt('/users?search=souza')

    expect(await screen.findByRole('searchbox', { name: /buscar/i })).toHaveValue('souza')
  })

  it('a busca da URL é enviada à API', async () => {
    mockUsers(5)
    renderAt('/users?search=souza')

    await screen.findByRole('table')

    expect(requestedQueries[0]).toContain('search=souza')
  })

  it('a ordenação da URL é refletida no cabeçalho', async () => {
    mockUsers(3)
    renderAt('/users?sort=name&order=asc')

    await screen.findByRole('table')

    expect(screen.getByRole('columnheader', { name: /nome/i })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
  })

  it('os itens por página da URL aparecem selecionados', async () => {
    mockUsers(3)
    renderAt('/users?perPage=50')

    expect(await screen.findByRole('combobox', { name: /itens por página/i })).toHaveValue('50')
  })

  it('valor inválido na URL não quebra a tela', async () => {
    mockUsers(3)
    renderAt('/users?page=abc&sort=senha&perPage=999')

    expect(await screen.findByRole('table')).toBeInTheDocument()
  })
})

describe('busca', () => {
  it('digitar filtra os resultados', async () => {
    const user = userEvent.setup()
    mockUsers(5)
    renderAt()

    await screen.findByRole('table')
    await user.type(screen.getByRole('searchbox', { name: /buscar/i }), 'souza')

    await waitFor(() => {
      expect(requestedQueries.at(-1)).toContain('search=souza')
    })
  })

  it('a busca sem resultado explica que o filtro não casou', async () => {
    apiServer.use(
      http.get(`${API_URL}/users`, () =>
        HttpResponse.json({ data: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 0 } }),
      ),
    )
    renderAt('/users?search=inexistente')

    expect(await screen.findByRole('heading', { name: /nenhum usuário encontrado/i })).toBeInTheDocument()
    expect(screen.getByText(/a busca por "inexistente" não retornou/i)).toBeInTheDocument()
  })

  // Lista vazia por filtro e base vazia são situações diferentes: a primeira
  // pede para revisar a busca, a segunda para cadastrar alguém.
  it('a base vazia tem mensagem diferente da busca sem resultado', async () => {
    apiServer.use(
      http.get(`${API_URL}/users`, () =>
        HttpResponse.json({ data: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 0 } }),
      ),
    )
    renderAt('/users')

    expect(await screen.findByRole('heading', { name: /nenhum usuário cadastrado/i })).toBeInTheDocument()
  })
})

describe('ordenação', () => {
  it('clicar no cabeçalho ordena de forma crescente', async () => {
    const user = userEvent.setup()
    mockUsers(3)
    renderAt()

    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /nome/i }))

    await waitFor(() => {
      expect(requestedQueries.at(-1)).toContain('sort=name')
    })
    expect(requestedQueries.at(-1)).toContain('order=asc')
  })

  it('clicar de novo inverte o sentido', async () => {
    const user = userEvent.setup()
    mockUsers(3)
    renderAt()

    await screen.findByRole('table')
    const cabecalho = screen.getByRole('button', { name: /nome/i })
    await user.click(cabecalho)
    await waitFor(() => {
      expect(requestedQueries.at(-1)).toContain('order=asc')
    })
    await user.click(cabecalho)

    await waitFor(() => {
      expect(requestedQueries.at(-1)).toContain('order=desc')
    })
  })

  // O cabeçalho ordenável é um botão de verdade, então funciona por teclado
  // sem manipulador próprio (critério S14).
  it('o cabeçalho ordenável é acionável por teclado', async () => {
    const user = userEvent.setup()
    mockUsers(3)
    renderAt()

    await screen.findByRole('table')
    screen.getByRole('button', { name: /email/i }).focus()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(requestedQueries.at(-1)).toContain('sort=email')
    })
  })
})

describe('paginação', () => {
  it('mostra a faixa de itens e o total', async () => {
    mockUsers(45)
    renderAt('/users?perPage=20')

    expect(await screen.findByText(/1–20 de 45/)).toBeInTheDocument()
  })

  it('avança para a próxima página', async () => {
    const user = userEvent.setup()
    mockUsers(45)
    renderAt('/users?perPage=20')

    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /próxima/i }))

    await waitFor(() => {
      expect(requestedQueries.at(-1)).toContain('page=2')
    })
  })

  it('desabilita "anterior" na primeira página', async () => {
    mockUsers(45)
    renderAt('/users?perPage=20')

    await screen.findByRole('table')

    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /primeira/i })).toBeDisabled()
  })

  it('desabilita "próxima" na última página', async () => {
    mockUsers(45)
    renderAt('/users?perPage=20&page=3')

    await screen.findByRole('table')

    expect(screen.getByRole('button', { name: /próxima/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /última/i })).toBeDisabled()
  })

  it('mudar itens por página volta para a primeira página', async () => {
    const user = userEvent.setup()
    mockUsers(45)
    renderAt('/users?perPage=20&page=3')

    await screen.findByRole('table')
    await user.selectOptions(screen.getByRole('combobox', { name: /itens por página/i }), '50')

    await waitFor(() => {
      expect(requestedQueries.at(-1)).toContain('perPage=50')
    })
    expect(requestedQueries.at(-1)).not.toContain('page=3')
  })

  it('a paginação é anunciável por leitor de tela', async () => {
    mockUsers(45)
    renderAt('/users?perPage=20')

    await screen.findByRole('table')

    expect(screen.getByRole('navigation', { name: /paginação/i })).toBeInTheDocument()
  })
})
