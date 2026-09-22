import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from '../src/App'
import { createQueryClient } from '../src/lib/queryClient'

function renderAt(route: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/*
 * Critério S11: cada tela tem endereço próprio e abre por URL direta. É o que
 * permite recarregar a página ou compartilhar o link de um usuário.
 */
describe('rotas abrem por URL direta', () => {
  it.each([
    ['/users', 'Usuários'],
    ['/users/new', 'Novo usuário'],
    ['/users/63f1ea59-25ad-41ab-8437-b8c00bed9031', 'Detalhes do usuário'],
    ['/users/63f1ea59-25ad-41ab-8437-b8c00bed9031/edit', 'Editar usuário'],
    ['/weather', 'Clima'],
  ])('%s abre a tela "%s"', (route, heading) => {
    renderAt(route)

    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  it('a raiz redireciona para a listagem', () => {
    renderAt('/')

    expect(screen.getByRole('heading', { level: 1, name: 'Usuários' })).toBeInTheDocument()
  })

  // Sem a ordem correta das rotas, "new" seria capturado como identificador e
  // a tela de cadastro nunca abriria.
  it('/users/new não é confundido com um identificador', () => {
    renderAt('/users/new')

    expect(screen.queryByText(/Detalhes de new/)).not.toBeInTheDocument()
  })

  it('rota desconhecida mostra a página de erro com caminho de volta', () => {
    renderAt('/rota-que-nao-existe')

    expect(screen.getByRole('heading', { level: 1, name: /não encontrada/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /voltar para a listagem/i })).toBeInTheDocument()
  })
})

describe('título do documento', () => {
  // Numa aplicação de página única o título não muda sozinho: sem isso, quem
  // usa leitor de tela não recebe anúncio da troca de contexto.
  it('acompanha a tela aberta', () => {
    renderAt('/weather')

    expect(document.title).toBe('Clima · Ideas Hub')
  })

  it('muda ao navegar para outra tela', () => {
    renderAt('/users/new')

    expect(document.title).toBe('Novo usuário · Ideas Hub')
  })
})

describe('navegação e acessibilidade', () => {
  it('a navegação principal é identificável por leitor de tela', () => {
    renderAt('/users')

    expect(screen.getByRole('navigation', { name: /navegação principal/i })).toBeInTheDocument()
  })

  it('o link de pular para o conteúdo é o primeiro elemento focável', () => {
    renderAt('/users')
    const links = screen.getAllByRole('link')

    expect(links[0]).toHaveTextContent(/pular para o conteúdo/i)
    expect(links[0]).toHaveAttribute('href', '#conteudo')
  })

  it('o alvo do link de pular existe na página', () => {
    const { container } = renderAt('/users')

    expect(container.querySelector('#conteudo')).not.toBeNull()
  })

  // aria-current é o que informa a posição a quem usa leitor de tela, e o que
  // não depende de o usuário distinguir as cores.
  it('marca o item ativo da navegação com aria-current', () => {
    renderAt('/weather')

    expect(screen.getByRole('link', { name: 'Clima' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Usuários' })).not.toHaveAttribute('aria-current')
  })

  it('cada tela tem exatamente um h1', () => {
    renderAt('/users')

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('a listagem oferece o caminho para o cadastro', () => {
    renderAt('/users')

    expect(screen.getByRole('link', { name: /novo usuário/i })).toHaveAttribute(
      'href',
      '/users/new',
    )
  })
})
