import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from '../src/App'
import { createQueryClient } from '../src/lib/queryClient'
import { API_URL, apiServer, buildUser, buildUserList } from './helpers/api-server'

/*
 * Uma exceção de render não pode apagar a aplicação.
 *
 * Sem limite de erro, o React desmonta a árvore inteira: some o cabeçalho, some
 * a navegação, a página fica em branco e não há saída sem recarregar.
 *
 * O gatilho demonstrado aqui é o que a revisão encontrou: `formatDate` chama
 * `Intl.DateTimeFormat.format(new Date(iso))` sem guarda, então basta um
 * registro com data em formato inesperado — mudança de serialização do banco,
 * um proxy, uma versão diferente da API — para lançar `RangeError` no meio do
 * render da listagem.
 *
 * O `console.error` é silenciado nestes casos porque o React registra a
 * exceção capturada de propósito, e o ruído esconderia falhas de verdade na
 * saída da suíte.
 */

beforeAll(() => {
  apiServer.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  apiServer.resetHandlers()
  vi.restoreAllMocks()
})

afterAll(() => {
  apiServer.close()
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

/** Data que o `Intl` recusa, como um backend fora do padrão poderia devolver. */
function listWithBrokenDate() {
  return buildUserList([buildUser({ createdAt: '0000-00-00 00:00:00' })])
}

describe('exceção durante o render da listagem', () => {
  it('a aplicação continua visível em vez de virar tela em branco', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    apiServer.use(http.get(`${API_URL}/users`, () => HttpResponse.json(listWithBrokenDate())))

    const { container } = renderApp()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    // A asserção que descreve o defeito original: antes, isto era string vazia.
    expect(container.innerHTML).not.toBe('')
  })

  it('a navegação continua no lugar, para a pessoa poder sair da tela quebrada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    apiServer.use(http.get(`${API_URL}/users`, () => HttpResponse.json(listWithBrokenDate())))

    renderApp()

    await screen.findByRole('alert')

    // É por isso que o limite fica em volta do conteúdo da rota, e não da
    // aplicação inteira: quem topou com o erro troca de tela em vez de ficar
    // preso.
    expect(screen.getByRole('navigation', { name: /navegação principal/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clima' })).toBeInTheDocument()
  })

  it('a mensagem é anunciada e oferece uma ação', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    apiServer.use(http.get(`${API_URL}/users`, () => HttpResponse.json(listWithBrokenDate())))

    renderApp()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/algo deu errado/i)
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument()
  })

  it('o erro não é engolido — chega ao console para quem for depurar', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    apiServer.use(http.get(`${API_URL}/users`, () => HttpResponse.json(listWithBrokenDate())))

    renderApp()
    await screen.findByRole('alert')

    // Um limite de erro que esconde a causa troca uma tela branca por uma
    // tela errada silenciosa, que é pior: ninguém fica sabendo.
    const registrou = logged.mock.calls.some((call) =>
      call.some((arg) => arg instanceof Error && /invalid time value/i.test(arg.message)),
    )
    expect(registrou).toBe(true)
  })

  it('navegar para outra tela limpa o erro', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    apiServer.use(http.get(`${API_URL}/users`, () => HttpResponse.json(listWithBrokenDate())))

    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('alert')

    await user.click(screen.getByRole('link', { name: 'Clima' }))

    // Sem a chave por caminho, o limite continuaria exibindo a falha da tela
    // anterior sobre uma tela que não tem problema nenhum.
    expect(await screen.findByRole('heading', { name: /clima/i })).toBeInTheDocument()
    expect(screen.queryByText(/algo deu errado nesta tela/i)).not.toBeInTheDocument()
  })
})

describe('telas sem exceção', () => {
  it('o limite não interfere no caminho normal', async () => {
    apiServer.use(http.get(`${API_URL}/users`, () => HttpResponse.json(buildUserList())))

    renderApp()

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByText(/algo deu errado nesta tela/i)).not.toBeInTheDocument()
  })
})
