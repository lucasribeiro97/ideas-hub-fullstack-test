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

describe('App', () => {
  it('renderiza a navegação principal em todas as rotas', () => {
    renderAt('/')

    const nav = screen.getByRole('navigation', { name: /navegação principal/i })
    expect(nav).toBeInTheDocument()
  })

  it('resolve cada rota conhecida para a sua tela', () => {
    renderAt('/users')
    expect(screen.getByRole('heading', { name: 'Usuários' })).toBeInTheDocument()
  })

  it('exibe página não encontrada para rota desconhecida', () => {
    renderAt('/no-such-route')
    expect(screen.getByRole('heading', { name: /não encontrada/i })).toBeInTheDocument()
  })
})
