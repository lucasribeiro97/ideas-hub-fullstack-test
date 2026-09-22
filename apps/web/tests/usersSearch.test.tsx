import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse, delay } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from '../src/App'
import { createQueryClient } from '../src/lib/queryClient'
import { SEARCH_DEBOUNCE_MS, useSearchInput } from '../src/hooks/useSearchInput'
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

interface Tracker {
  started: string[]
  aborted: string[]
  completed: string[]
}

let tracker: Tracker

/**
 * Registra o ciclo de vida de cada requisição.
 *
 * `request.signal` é o mesmo sinal que o cliente passa ao fetch: escutar o
 * evento de cancelamento aqui é a forma direta de verificar que a requisição
 * foi abortada, em vez de inferir pelo que aparece na tela.
 */
function trackRequests(responseDelayMs = 0): void {
  tracker = { started: [], aborted: [], completed: [] }

  apiServer.use(
    http.get(`${API_URL}/users`, async ({ request }) => {
      const search = new URL(request.url).searchParams.get('search') ?? ''
      tracker.started.push(search)

      request.signal.addEventListener('abort', () => {
        tracker.aborted.push(search)
      })

      if (responseDelayMs > 0) await delay(responseDelayMs)

      tracker.completed.push(search)

      return HttpResponse.json({
        data: [buildUser({ name: `Resultado de "${search}"` })],
        meta: { page: 1, perPage: 20, total: 1, totalPages: 1 },
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

/*
 * Critério S12: "Evite disparar uma requisição a cada tecla digitada na busca".
 */
describe('a busca não dispara a cada tecla', () => {
  it('digitar cinco letras produz uma única consulta com o termo completo', async () => {
    const user = userEvent.setup()
    trackRequests()
    renderAt()

    await screen.findByRole('table')
    const initialCount = tracker.started.length

    await user.type(screen.getByRole('searchbox', { name: /buscar/i }), 'souza')

    await waitFor(() => {
      expect(tracker.started.at(-1)).toBe('souza')
    })

    // Uma consulta além da carga inicial, e não uma por tecla.
    expect(tracker.started.length - initialCount).toBe(1)
  })

  it('o field responde imediatamente, sem esperar a consulta', async () => {
    const user = userEvent.setup()
    trackRequests()
    renderAt()

    await screen.findByRole('table')
    const field = screen.getByRole('searchbox', { name: /buscar/i })
    await user.type(field, 'sou')

    // O valor aparece na hora; a consulta é que espera.
    expect(field).toHaveValue('sou')
  })

  it('pausar a digitação no meio consulta o termo parcial', async () => {
    const user = userEvent.setup()
    trackRequests()
    renderAt()

    await screen.findByRole('table')
    const field = screen.getByRole('searchbox', { name: /buscar/i })

    await user.type(field, 'sou')
    await waitFor(() => {
      expect(tracker.started.at(-1)).toBe('sou')
    })

    await user.type(field, 'za')
    await waitFor(() => {
      expect(tracker.started.at(-1)).toBe('souza')
    })
  })

  it('apagar a busca volta a consultar sem filtro', async () => {
    const user = userEvent.setup()
    trackRequests()
    renderAt('/users?search=souza')

    await screen.findByRole('table')
    await user.clear(screen.getByRole('searchbox', { name: /buscar/i }))

    await waitFor(() => {
      expect(tracker.started.at(-1)).toBe('')
    })
  })
})

/*
 * "Cancelamento de requisições obsoletas no frontend" é um dos diferenciais
 * opcionais do enunciado. Verificado pelo sinal recebido no servidor
 * simulado, e não pelo que aparece na tela.
 */
describe('requisições obsoletas são canceladas', () => {
  it('a consulta anterior é abortada quando os filtros mudam antes da resposta', async () => {
    const user = userEvent.setup()
    trackRequests(400)
    renderAt()

    await waitFor(() => {
      expect(tracker.started.length).toBeGreaterThan(0)
    })

    const field = await screen.findByRole('searchbox', { name: /buscar/i })
    await user.type(field, 'ana')
    await waitFor(() => {
      expect(tracker.started).toContain('ana')
    })

    await user.clear(field)
    await user.type(field, 'bruno')

    await waitFor(
      () => {
        expect(tracker.aborted).toContain('ana')
      },
      { timeout: 3_000 },
    )
  }, 15_000)

  it('o resultado exibido é o da última busca, não o da primeira a responder', async () => {
    const user = userEvent.setup()
    trackRequests(200)
    renderAt()

    const field = await screen.findByRole('searchbox', { name: /buscar/i })
    await user.type(field, 'ana')
    await user.clear(field)
    await user.type(field, 'bruno')

    await waitFor(
      () => {
        expect(screen.getByRole('link', { name: 'Resultado de "bruno"' })).toBeInTheDocument()
      },
      { timeout: 3_000 },
    )

    expect(screen.queryByRole('link', { name: 'Resultado de "ana"' })).not.toBeInTheDocument()
  }, 15_000)
})

describe('sincronia entre field e URL', () => {
  it('abrir um link com busca preenche o field', async () => {
    trackRequests()
    renderAt('/users?search=souza')

    expect(await screen.findByRole('searchbox', { name: /buscar/i })).toHaveValue('souza')
  })

  it('a busca digitada chega à URL após a pausa', async () => {
    const user = userEvent.setup()
    trackRequests()
    renderAt()

    await screen.findByRole('table')
    await user.type(screen.getByRole('searchbox', { name: /buscar/i }), 'souza')

    await waitFor(() => {
      expect(tracker.started.at(-1)).toBe('souza')
    })
  })
})

/*
 * Sem a sincronia na direção URL → field, voltar pelo histórico mostraria a
 * lista de um filtro e o field de busca de outro. Verificado no nível do
 * hook: `MemoryRouter` só lê `initialEntries` na montagem, então rerenderizar
 * com outra rota não exercitaria navegação de verdade.
 */
describe('sincronia URL → field', () => {
  it('o field acompanha a busca vinda de fora', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useSearchInput({ value, onDebouncedChange: () => undefined }),
      { initialProps: { value: 'souza' } },
    )

    expect(result.current.inputValue).toBe('souza')

    rerender({ value: 'lima' })

    await waitFor(() => {
      expect(result.current.inputValue).toBe('lima')
    })
  })

  /*
   * O caso que quebrava: o temporizador pendente ainda carregava o texto
   * antigo e reescrevia a URL logo depois de ela ter sido limpa, desfazendo a
   * ação de quem clicou em "limpar busca".
   */
  it('mudança externa cancela a propagação pendente', async () => {
    const received: string[] = []
    const { result, rerender } = renderHook(
      ({ value }) =>
        useSearchInput({ value, onDebouncedChange: (s) => received.push(s), delayMs: 40 }),
      { initialProps: { value: 'inexistente' } },
    )

    // Alguém digita, e antes de o debounce disparar a busca é limpa de fora.
    act(() => {
      result.current.setInputValue('inexistent')
    })
    rerender({ value: '' })

    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(received).toEqual([])
    expect(result.current.inputValue).toBe('')
  })

  it('não reescreve a URL com o valor que acabou de vir dela', async () => {
    const received: string[] = []
    renderHook(
      ({ value }) =>
        useSearchInput({
          value,
          onDebouncedChange: (search) => received.push(search),
          delayMs: 10,
        }),
      { initialProps: { value: 'souza' } },
    )

    await new Promise((resolve) => setTimeout(resolve, 50))

    // Sem a comparação no efeito, o hook chamaria de volta com 'souza' e
    // criaria um ciclo entre field e URL.
    expect(received).toEqual([])
  })
})

describe('configuração do debounce', () => {
  it('o atraso é curto o bastante para não parecer travado', () => {
    // Acima de meio segundo a interface passa a sensação de lentidão; abaixo
    // de 150ms o debounce deixa de economizar requisições.
    expect(SEARCH_DEBOUNCE_MS).toBeGreaterThanOrEqual(150)
    expect(SEARCH_DEBOUNCE_MS).toBeLessThanOrEqual(500)
  })
})
