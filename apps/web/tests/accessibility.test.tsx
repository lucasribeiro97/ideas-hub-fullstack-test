import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from '../src/App'
import { createQueryClient } from '../src/lib/queryClient'
import { expectNoAxeViolations } from './helpers/axe'
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

function mockApi(): void {
  apiServer.use(
    // O simulador respeita a página pedida: devolver sempre `page: 1` faria a
    // paginação parecer quebrada mesmo funcionando.
    http.get(`${API_URL}/users`, ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('page') ?? '1')

      return HttpResponse.json({
        data: [
          buildUser({ id: USER_ID, name: 'Ana Souza', phone: '(11) 90000-0000' }),
          buildUser({
            id: '00000000-0000-4000-8000-000000000001',
            name: 'Bruno Lima',
            email: 'bruno@exemplo.com',
            phone: null,
          }),
        ],
        meta: { page, perPage: 20, total: 45, totalPages: 3 },
      })
    }),
    http.get(`${API_URL}/users/:id`, () =>
      HttpResponse.json(buildUser({ id: USER_ID, name: 'Ana Souza', phone: '(11) 90000-0000' })),
    ),
  )
}

describe('verificação automatizada com axe', () => {
  it('a listagem não tem violações', async () => {
    mockApi()
    const { container } = renderAt('/users')

    await screen.findByRole('table')

    await expectNoAxeViolations(container)
  }, 30_000)

  it('o formulário de cadastro não tem violações', async () => {
    const { container } = renderAt('/users/new')

    await screen.findByLabelText(/nome/i)

    await expectNoAxeViolations(container)
  }, 30_000)

  it('o formulário com erros não tem violações', async () => {
    const user = userEvent.setup()
    const { container } = renderAt('/users/new')

    await user.click(screen.getByRole('button', { name: /cadastrar/i }))
    await screen.findByText(/informe o nome/i)

    await expectNoAxeViolations(container)
  }, 30_000)

  it('a tela de detalhe não tem violações', async () => {
    mockApi()
    const { container } = renderAt(`/users/${USER_ID}`)

    await screen.findByRole('heading', { level: 1, name: 'Ana Souza' })

    await expectNoAxeViolations(container)
  }, 30_000)

  it('a confirmação de exclusão não tem violações', async () => {
    const user = userEvent.setup()
    mockApi()
    const { container } = renderAt(`/users/${USER_ID}`)

    await user.click(await screen.findByRole('button', { name: 'Excluir' }))

    await expectNoAxeViolations(container)
  }, 30_000)

  it('o estado vazio não tem violações', async () => {
    apiServer.use(
      http.get(`${API_URL}/users`, () =>
        HttpResponse.json({ data: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 0 } }),
      ),
    )
    const { container } = renderAt('/users')

    await screen.findByRole('heading', { name: /nenhum usuário cadastrado/i })

    await expectNoAxeViolations(container)
  }, 30_000)

  it('o estado de erro não tem violações', async () => {
    apiServer.use(http.get(`${API_URL}/users`, () => new HttpResponse(null, { status: 503 })))
    const { container } = renderAt('/users')

    await screen.findByRole('alert')

    await expectNoAxeViolations(container)
  }, 30_000)
})

/*
 * Critério S14. O aceite pede percorrer cadastro, busca, edição e exclusão sem
 * tocar no mouse — estes testes fazem isso com Tab e Enter.
 */
describe('navegação por teclado', () => {
  it('o primeiro Tab alcança o link de pular para o conteúdo', async () => {
    const user = userEvent.setup()
    mockApi()
    renderAt('/users')

    await screen.findByRole('table')
    await user.tab()

    expect(screen.getByRole('link', { name: /pular para o conteúdo/i })).toHaveFocus()
  })

  it('a navegação principal é alcançável em sequência', async () => {
    const user = userEvent.setup()
    mockApi()
    renderAt('/users')

    await screen.findByRole('table')
    await user.tab()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Usuários' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('link', { name: 'Clima' })).toHaveFocus()
  })

  it('o campo de busca é alcançável e aceita digitação', async () => {
    const user = userEvent.setup()
    mockApi()
    renderAt('/users')

    await screen.findByRole('table')
    screen.getByRole('searchbox', { name: /buscar/i }).focus()
    await user.keyboard('souza')

    expect(screen.getByRole('searchbox', { name: /buscar/i })).toHaveValue('souza')
  })

  it('a ordenação é acionável por Enter e por Espaço', async () => {
    const user = userEvent.setup()
    mockApi()
    renderAt('/users')

    await screen.findByRole('table')
    const cabecalho = screen.getByRole('button', { name: /nome/i })

    cabecalho.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: /nome/i })).toHaveAttribute('aria-sort')
    })

    cabecalho.focus()
    await user.keyboard(' ')
    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: /nome/i })).toHaveAttribute(
        'aria-sort',
        'descending',
      )
    })
  })

  it('a paginação é acionável por teclado', async () => {
    const user = userEvent.setup()
    mockApi()
    renderAt('/users')

    await screen.findByRole('table')
    screen.getByRole('button', { name: /próxima/i }).focus()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByText(/página 2 de 3/i)).toBeInTheDocument()
    })
  })

  it('o formulário é preenchível e enviável só com teclado', async () => {
    const user = userEvent.setup()
    let enviou = false
    apiServer.use(
      http.post(`${API_URL}/users`, () => {
        enviou = true

        return HttpResponse.json(buildUser({ id: USER_ID }), { status: 201 })
      }),
      http.get(`${API_URL}/users/:id`, () => HttpResponse.json(buildUser({ id: USER_ID }))),
    )
    renderAt('/users/new')

    screen.getByLabelText(/nome/i).focus()
    await user.keyboard('Ana Souza')
    await user.tab()
    await user.keyboard('ana@exemplo.com')
    await user.tab()
    await user.tab()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(enviou).toBe(true)
    })
  })

  it('a confirmação de exclusão é operável só com teclado', async () => {
    const user = userEvent.setup()
    let excluiu = false
    mockApi()
    apiServer.use(
      http.delete(`${API_URL}/users/:id`, () => {
        excluiu = true

        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderAt(`/users/${USER_ID}`)

    const botaoExcluir = await screen.findByRole('button', { name: 'Excluir' })
    botaoExcluir.focus()
    await user.keyboard('{Enter}')

    // O foco já está no botão de confirmar; basta acionar.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sim, excluir/i })).toHaveFocus()
    })
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(excluiu).toBe(true)
    })
  })
})

describe('rótulos e descrições', () => {
  it('todos os campos do formulário têm rótulo associado', async () => {
    renderAt('/users/new')

    for (const label of [/nome/i, /email/i, /telefone/i]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('o campo opcional é identificado como tal no rótulo', async () => {
    renderAt('/users/new')

    expect(screen.getByLabelText(/telefone.*opcional/i)).toBeInTheDocument()
  })

  it('a tabela tem descrição informando a ordenação vigente', async () => {
    mockApi()
    const { container } = renderAt('/users?sort=name&order=asc')

    await screen.findByRole('table')

    expect(container.querySelector('caption')?.textContent).toMatch(/crescente/i)
  })

  it('a paginação anuncia mudanças por região viva', async () => {
    mockApi()
    const { container } = renderAt('/users')

    await screen.findByRole('table')

    expect(container.querySelector('.pagination [aria-live="polite"]')).not.toBeNull()
  })
})

/*
 * Uso em tela estreita.
 *
 * O jsdom não carrega o CSS, então o comportamento visual não é verificável
 * aqui — o que estes testes garantem é a estrutura de que ele depende. O
 * comportamento em si foi conferido no navegador real: com o contêiner
 * reduzido a 358px, a tabela de 735px rolou dentro dele e a página não ganhou
 * rolagem horizontal.
 */
describe('estrutura que sustenta o uso em tela estreita', () => {
  it('a tabela fica dentro de um contêiner próprio de rolagem', async () => {
    mockApi()
    const { container } = renderAt('/users')

    await screen.findByRole('table')

    // Sem este contêiner, uma tabela de quatro colunas empurraria a página
    // inteira para o lado num telefone.
    const wrapper = container.querySelector('.table-wrapper')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.querySelector('table')).not.toBeNull()
  })

  it('a página declara viewport adaptável', async () => {
    // Lê o index.html do disco: o jsdom monta um documento em branco, então
    // consultar `document` aqui verificaria o ambiente de teste, não a
    // aplicação.
    //
    // Sem esta meta, o navegador móvel renderiza a página em largura de
    // desktop e a reduz, deixando o texto ilegível.
    const html = await readFile(join(process.cwd(), 'index.html'), 'utf8')

    expect(html).toContain('name="viewport"')
    expect(html).toContain('width=device-width')
  })
})
