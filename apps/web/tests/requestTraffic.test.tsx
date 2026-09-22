import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from '../src/App'
import { createQueryClient } from '../src/lib/queryClient'
import { apiServer, recordRequests } from './helpers/api-server'
import { currentUsers, installFakeApi, seedUsers } from './helpers/fake-api'

/*
 * O que a tela pede à API, e não só o que ela mostra depois.
 *
 * Dois defeitos chegaram ao uso manual passando por toda a suíte: excluir um
 * usuário disparava uma busca do registro recém-apagado, que voltava 404, e
 * salvar uma edição disparava duas buscas do dado que a própria resposta do
 * PATCH já trazia. Nos dois casos a tela terminava certa — o usuário sumia da
 * lista, o nome novo aparecia — e por isso nenhuma asserção sobre a tela tinha
 * como falhar.
 *
 * Estes casos olham o tráfego. São o único lugar da suíte onde uma requisição a
 * mais é um defeito, e não um detalhe de implementação.
 */

beforeAll(() => {
  apiServer.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  apiServer.resetHandlers()
})

afterAll(() => {
  apiServer.close()
})

const BASE = [
  { name: 'Ana Souza', email: 'ana.souza@exemplo.com', phone: '(11) 90000-0001' },
  { name: 'Bruno Lima', email: 'bruno@exemplo.com', phone: null },
  { name: 'Carla Souza', email: 'carla@exemplo.com', phone: null },
]

beforeEach(() => {
  seedUsers(BASE)
  installFakeApi()
})

function renderApp(route: string) {
  return render(
    <QueryClientProvider client={createQueryClient({ queries: { retry: false } })}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function requestsFor(traffic: { method: string; path: string }[], id: string): string[] {
  return traffic.filter((entry) => entry.path.startsWith(`/users/${id}`)).map((entry) => entry.method)
}

describe('tráfego da edição', () => {
  it('salvar não busca de novo o registro que a resposta já devolveu', async () => {
    const traffic = recordRequests()
    const alvo = currentUsers()[0]!
    const user = userEvent.setup()

    renderApp(`/users/${alvo.id}/edit`)

    const nome = await screen.findByLabelText(/nome/i)
    await user.clear(nome)
    await user.type(nome, 'Ana Souza Alterada')
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }))

    // A navegação para o detalhe confirma que a gravação terminou; sem esperar
    // por ela, o teste contaria o tráfego antes de a tela de destino montar.
    await screen.findByRole('heading', { name: 'Ana Souza Alterada' })

    expect(requestsFor(traffic, alvo.id)).toEqual([
      'GET', // preencher o formulário
      'PATCH', // gravar
    ])
  })

  it('a tela de detalhe mostra o dado gravado sem pedi-lo de novo', async () => {
    const traffic = recordRequests()
    const alvo = currentUsers()[0]!
    const user = userEvent.setup()

    renderApp(`/users/${alvo.id}/edit`)

    const nome = await screen.findByLabelText(/nome/i)
    await user.clear(nome)
    await user.type(nome, 'Ana Renomeada')
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }))

    await screen.findByRole('heading', { name: 'Ana Renomeada' })

    // O valor exibido vem do cache semeado pela resposta. Se ele estivesse
    // errado, o nome antigo apareceria — e é isso que torna a economia de
    // requisição segura em vez de apenas econômica.
    expect(screen.getByText('ana.souza@exemplo.com')).toBeInTheDocument()
    expect(requestsFor(traffic, alvo.id).filter((method) => method === 'GET')).toHaveLength(1)
  })
})

describe('tráfego da exclusão', () => {
  it('excluir não busca o registro apagado', async () => {
    const traffic = recordRequests()
    const alvo = currentUsers()[0]!
    const user = userEvent.setup()

    renderApp(`/users/${alvo.id}`)

    await screen.findByRole('heading', { name: 'Ana Souza' })
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: /sim, excluir/i }))

    await screen.findByRole('table')

    // Um GET depois do DELETE só pode voltar 404: o registro não existe mais.
    const sequencia = requestsFor(traffic, alvo.id)
    expect(sequencia.indexOf('DELETE')).toBe(sequencia.length - 1)
  })

  it('nenhuma requisição da tela termina em erro durante a exclusão', async () => {
    const respostas: number[] = []
    apiServer.events.on('response:mocked', ({ response }) => {
      respostas.push(response.status)
    })

    const alvo = currentUsers()[0]!
    const user = userEvent.setup()

    renderApp(`/users/${alvo.id}`)

    await screen.findByRole('heading', { name: 'Ana Souza' })
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: /sim, excluir/i }))

    await screen.findByRole('table')
    await waitFor(() => {
      expect(respostas.some((status) => status >= 400)).toBe(false)
    })

    apiServer.events.removeAllListeners('response:mocked')
  })
})
