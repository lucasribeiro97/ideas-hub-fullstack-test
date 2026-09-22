import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from '../src/App'
import { createQueryClient } from '../src/lib/queryClient'
import { apiServer } from './helpers/api-server'
import { currentUsers, installFakeApi, seedUsers } from './helpers/fake-api'

beforeAll(() => {
  apiServer.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  apiServer.resetHandlers()
})

afterAll(() => {
  apiServer.close()
})

/**
 * Base com nomes escolhidos de propósito: "Souza" aparece em nome e em email,
 * e há homônimos parciais, para que a busca precise de fato filtrar.
 */
const BASE = [
  { name: 'Ana Souza', email: 'ana.souza@exemplo.com', phone: '(11) 90000-0001' },
  { name: 'Bruno Lima', email: 'bruno@exemplo.com', phone: null },
  { name: 'Carla Souza', email: 'carla@exemplo.com', phone: '(11) 90000-0003' },
  { name: 'Diego Reis', email: 'diego.souza@exemplo.com', phone: null },
  { name: 'Elisa Prado', email: 'elisa@exemplo.com', phone: '(11) 90000-0005' },
  { name: 'Fabio Melo', email: 'fabio@exemplo.com', phone: null },
  { name: 'Gabi Nunes', email: 'gabi@exemplo.com', phone: null },
]

beforeEach(() => {
  seedUsers(BASE)
  installFakeApi()
})

function renderApp(route = '/users') {
  return render(
    <QueryClientProvider client={createQueryClient({ queries: { retry: false } })}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Nomes visíveis na tabela, na ordem em que aparecem. */
function visibleNames(): string[] {
  const rows = screen.getAllByRole('row').slice(1)

  return rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '')
}

/*
 * O fluxo que o enunciado exige entre os cenários de teste obrigatórios.
 *
 * A API simulada implementa filtro, ordenação e paginação de verdade: com
 * respostas fixas, este teste passaria mesmo que a tela ignorasse os filtros.
 */
describe('percurso: buscar, paginar e abrir um usuário', () => {
  it('atravessa o fluxo inteiro', async () => {
    const user = userEvent.setup()
    renderApp()

    // 1. A listagem abre com todos os usuários.
    await screen.findByRole('table')
    expect(screen.getByText(/1–7 de 7/)).toBeInTheDocument()

    // 2. Buscar reduz o conjunto — e casa por nome OU email.
    await user.type(screen.getByRole('searchbox', { name: /buscar/i }), 'souza')
    await waitFor(() => {
      expect(screen.getByText(/1–3 de 3/)).toBeInTheDocument()
    })
    expect(visibleNames().sort()).toEqual(['Ana Souza', 'Carla Souza', 'Diego Reis'])

    // 3. Reduzir os itens por página faz a paginação aparecer.
    await user.selectOptions(screen.getByRole('combobox', { name: /itens por página/i }), '10')
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /itens por página/i })).toHaveValue('10')
    })

    // 4. Ordenar por nome muda a ordem visível, não só a URL.
    await user.click(screen.getByRole('button', { name: /nome/i }))
    await waitFor(() => {
      expect(visibleNames()).toEqual(['Ana Souza', 'Carla Souza', 'Diego Reis'])
    })

    // 5. Abrir um usuário mostra os dados dele.
    await user.click(screen.getByRole('link', { name: 'Carla Souza' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Carla Souza' })).toBeInTheDocument()
    expect(screen.getByText('(11) 90000-0003')).toBeInTheDocument()

    // 6. Voltar preserva a busca — o contexto não se perde.
    await user.click(screen.getByRole('link', { name: /voltar para a listagem/i }))
    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: /buscar/i })).toHaveValue('souza')
    })
    expect(screen.getByText(/de 3/)).toBeInTheDocument()
  }, 30_000)

  it('pagina dentro do resultado filtrado, sem misturar com o restante', async () => {
    const user = userEvent.setup()
    renderApp('/users?perPage=10')

    await screen.findByRole('table')
    await user.type(screen.getByRole('searchbox', { name: /buscar/i }), 'souza')

    await waitFor(() => {
      expect(screen.getByText(/1–3 de 3/)).toBeInTheDocument()
    })

    // Com 3 resultados em páginas de 10, não há próxima página: o total
    // acompanha o filtro, e não a base inteira.
    expect(screen.getByRole('button', { name: /próxima/i })).toBeDisabled()
  }, 30_000)

  it('percorre as páginas sem repetir nem perder registros', async () => {
    const user = userEvent.setup()

    // Conjunto maior que o das demais situações: o menor valor de "itens por
    // página" oferecido é 10, então são necessários mais de 10 registros para
    // existir uma segunda página.
    seedUsers(
      Array.from({ length: 23 }, (_unused, index) => ({
        name: `Usuário ${String(index + 1).padStart(2, '0')}`,
        email: `usuario${String(index + 1).padStart(2, '0')}@exemplo.com`,
      })),
    )
    renderApp('/users?perPage=10&sort=name&order=asc')

    await screen.findByRole('table')
    expect(screen.getByText(/1–10 de 23/)).toBeInTheDocument()
    const pageOne = visibleNames()

    await user.click(screen.getByRole('button', { name: /próxima/i }))
    await waitFor(() => {
      expect(screen.getByText(/página 2 de 3/)).toBeInTheDocument()
    })
    const pageTwo = visibleNames()

    await user.click(screen.getByRole('button', { name: /última/i }))
    await waitFor(() => {
      expect(screen.getByText(/página 3 de 3/)).toBeInTheDocument()
    })
    const pageThree = visibleNames()

    // Sem o desempate determinístico na ordenação, um registro apareceria em
    // duas páginas enquanto outro sumiria.
    const allNames = [...pageOne, ...pageTwo, ...pageThree]
    expect(allNames).toHaveLength(23)
    expect(new Set(allNames).size).toBe(23)
  }, 30_000)
})

/*
 * Os fluxos de escrita, verificados pelo efeito observável na listagem — e não
 * apenas pela resposta da requisição.
 */
describe('percurso: cadastrar', () => {
  it('o usuário criado aparece na listagem', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('table')
    await user.click(screen.getByRole('link', { name: /novo usuário/i }))

    await user.type(await screen.findByLabelText(/nome/i), 'Helena Prado')
    await user.type(screen.getByLabelText(/email/i), 'helena@exemplo.com')
    await user.type(screen.getByLabelText(/telefone/i), '(11) 98888-0000')
    await user.click(screen.getByRole('button', { name: /cadastrar/i }))

    // Vai para o detalhe do recém-criado.
    expect(await screen.findByRole('heading', { level: 1, name: 'Helena Prado' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /voltar para a listagem/i }))

    await waitFor(() => {
      expect(screen.getByText(/de 8/)).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: 'Helena Prado' })).toBeInTheDocument()
  }, 30_000)

  it('email já cadastrado é recusado no campo, e nada é criado', async () => {
    const user = userEvent.setup()
    renderApp('/users/new')

    await user.type(await screen.findByLabelText(/nome/i), 'Outra Ana')
    // Mesma pessoa da base, com a caixa trocada: a unicidade não distingue.
    await user.type(screen.getByLabelText(/email/i), 'ANA.SOUZA@exemplo.com')
    await user.click(screen.getByRole('button', { name: /cadastrar/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true')
    })
    expect(screen.getByLabelText(/email/i)).toHaveAccessibleDescription(/já está cadastrado/i)
    expect(currentUsers()).toHaveLength(7)
  }, 30_000)
})

describe('percurso: editar', () => {
  it('a alteração aparece na listagem', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('table')
    await user.click(screen.getByRole('link', { name: 'Bruno Lima' }))
    await user.click(await screen.findByRole('link', { name: /editar/i }))

    const nameField = await screen.findByLabelText(/nome/i)
    await user.clear(nameField)
    await user.type(nameField, 'Bruno Lima Neto')
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bruno Lima Neto' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /voltar para a listagem/i }))

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Bruno Lima Neto' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('link', { name: 'Bruno Lima' })).not.toBeInTheDocument()
  }, 30_000)

  it('manter o próprio email não é tratado como conflito', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('table')
    await user.click(screen.getByRole('link', { name: 'Ana Souza' }))
    await user.click(await screen.findByRole('link', { name: /editar/i }))

    // Salva sem alterar o email, que é o caso em que uma verificação de
    // unicidade mal feita acusaria conflito.
    const nameField = await screen.findByLabelText(/nome/i)
    await user.clear(nameField)
    await user.type(nameField, 'Ana Souza Lima')
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ana Souza Lima' }),
    ).toBeInTheDocument()
  }, 30_000)
})

describe('percurso: excluir', () => {
  it('o usuário some da listagem e o contexto de busca é mantido', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('table')
    await user.type(screen.getByRole('searchbox', { name: /buscar/i }), 'souza')
    await waitFor(() => {
      expect(screen.getByText(/1–3 de 3/)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('link', { name: 'Carla Souza' }))
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: /sim, excluir/i }))

    // De volta à listagem, ainda filtrada, com um resultado a menos.
    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: /buscar/i })).toHaveValue('souza')
    })
    await waitFor(() => {
      expect(screen.getByText(/1–2 de 2/)).toBeInTheDocument()
    })
    expect(screen.queryByRole('link', { name: 'Carla Souza' })).not.toBeInTheDocument()
    expect(currentUsers()).toHaveLength(6)
  }, 30_000)

  it('cancelar não remove ninguém', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('table')
    await user.click(screen.getByRole('link', { name: 'Ana Souza' }))
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(currentUsers()).toHaveLength(7)
    expect(screen.getByRole('heading', { level: 1, name: 'Ana Souza' })).toBeInTheDocument()
  }, 30_000)
})
