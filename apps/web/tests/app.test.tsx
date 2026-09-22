import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from '../src/App'
import { criarQueryClient } from '../src/lib/queryClient'

function renderizar(rota: string) {
  return render(
    <QueryClientProvider client={criarQueryClient()}>
      <MemoryRouter initialEntries={[rota]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('App', () => {
  it('renderiza a navegação principal em todas as rotas', () => {
    renderizar('/')

    const nav = screen.getByRole('navigation', { name: /navegação principal/i })
    expect(nav).toBeInTheDocument()
  })

  it('resolve cada rota conhecida para a sua tela', () => {
    renderizar('/usuarios')
    expect(screen.getByRole('heading', { name: 'Usuários' })).toBeInTheDocument()
  })

  it('exibe página não encontrada para rota desconhecida', () => {
    renderizar('/rota-que-nao-existe')
    expect(screen.getByRole('heading', { name: /não encontrada/i })).toBeInTheDocument()
  })
})
