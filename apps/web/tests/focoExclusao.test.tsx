import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from '../src/App'
import { createQueryClient } from '../src/lib/queryClient'
import { apiServer } from './helpers/api-server'
import { currentUsers, installFakeApi, seedUsers } from './helpers/fake-api'

/*
 * O foco precisa voltar de onde saiu.
 *
 * A confirmação de exclusão move o foco para "Sim, excluir" ao abrir, e isso
 * está certo. O que faltava era a volta: ao cancelar, o botão focado deixa de
 * existir e o foco cai no `<body>`. Quem navega por teclado perde a posição no
 * meio do fluxo e precisa percorrer a página inteira de novo para voltar ao
 * ponto onde estava — exatamente o percurso que o critério S14 cobre.
 *
 * Encontrado pela revisão adversarial. Os testes de acessibilidade existentes
 * verificavam que o foco **chega** ao botão de confirmar, e nenhum verificava o
 * que acontece depois da ação.
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

beforeEach(() => {
  // Dois usuários de propósito: apagar o único deixaria a base vazia, e a
  // listagem mostraria o estado vazio em vez da tabela.
  seedUsers([
    { name: 'Ana Souza', email: 'ana@exemplo.com', phone: null },
    { name: 'Bruno Lima', email: 'bruno@exemplo.com', phone: null },
  ])
  installFakeApi()
})

function renderDetail() {
  const id = currentUsers()[0]!.id

  return render(
    <QueryClientProvider client={createQueryClient({ queries: { retry: false } })}>
      <MemoryRouter initialEntries={[`/users/${id}`]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('foco no fluxo de exclusão', () => {
  it('cancelar devolve o foco ao botão que abriu a confirmação', async () => {
    const user = userEvent.setup()
    renderDetail()

    await screen.findByRole('heading', { name: 'Ana Souza' })
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    // O botão volta a existir quando a confirmação fecha; o foco precisa voltar
    // para ele, e não para o início da página.
    expect(await screen.findByRole('button', { name: 'Excluir' })).toHaveFocus()
  })

  it('a confirmação continua recebendo o foco ao abrir', async () => {
    const user = userEvent.setup()
    renderDetail()

    await screen.findByRole('heading', { name: 'Ana Souza' })
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))

    // Comportamento que já existia e não pode regredir.
    expect(screen.getByRole('button', { name: /sim, excluir/i })).toHaveFocus()
  })

  it('cancelar pelo Escape também devolve o foco', async () => {
    const user = userEvent.setup()
    renderDetail()

    await screen.findByRole('heading', { name: 'Ana Souza' })
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await user.keyboard('{Escape}')

    expect(await screen.findByRole('button', { name: 'Excluir' })).toHaveFocus()
  })

  it('depois de excluir, o foco vai para o conteúdo principal', async () => {
    const user = userEvent.setup()
    renderDetail()

    await screen.findByRole('heading', { name: 'Ana Souza' })
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: /sim, excluir/i }))

    await screen.findByRole('table')

    // Aqui não há para onde voltar: o botão de origem foi removido junto com a
    // tela. O destino é o `<main>`, que já tem `tabIndex={-1}` para isso — sem
    // ele, o foco cairia no `<body>` e a navegação por teclado recomeçaria do
    // topo da página.
    expect(document.querySelector('#conteudo')).toHaveFocus()
  })
})
