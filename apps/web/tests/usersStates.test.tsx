import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse, delay } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from '../src/App'
import { ApiError } from '../src/api/client'
import { createQueryClient } from '../src/lib/queryClient'
import { describeError } from '../src/lib/describeError'
import { API_URL, apiServer, buildUser, buildUserList } from './helpers/api-server'

beforeAll(() => {
  apiServer.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  apiServer.resetHandlers()
})

afterAll(() => {
  apiServer.close()
})

function renderAt(route = '/users') {
  return render(
    <QueryClientProvider client={createQueryClient({ queries: { retry: false } })}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/*
 * A mensagem crua da API responde "o que aconteceu"; quem está na tela precisa
 * saber "o que fazer agora".
 */
describe('describeError', () => {
  it('falha de rede orienta a verificar a conexão e permite repetir', () => {
    const resultado = describeError(new ApiError(0, 'NETWORK_ERROR', 'qualquer'))

    expect(resultado.description).toMatch(/conexão/i)
    expect(resultado.canRetry).toBe(true)
  })

  it('falha de rede deixa claro que nada foi alterado', () => {
    // Sem essa informação, quem estava salvando um formulário não sabe se
    // deve tentar de novo ou se criaria um registro duplicado.
    expect(describeError(new ApiError(0, 'NETWORK_ERROR', 'x')).description).toMatch(
      /nada foi alterado/i,
    )
  })

  it('erro do servidor permite repetir', () => {
    expect(describeError(new ApiError(503, 'X', 'y')).canRetry).toBe(true)
  })

  // Repetir um 404 não muda o resultado; oferecer "tentar novamente" ali
  // levaria a pessoa a insistir num caminho sem saída.
  it('recurso inexistente não oferece repetição', () => {
    expect(describeError(new ApiError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.')).canRetry).toBe(
      false,
    )
  })

  it('erro de validação usa a mensagem da API, que já é específica', () => {
    const resultado = describeError(
      new ApiError(422, 'VALIDATION_ERROR', 'Dados inválidos.'),
    )

    expect(resultado.description).toBe('Dados inválidos.')
    expect(resultado.canRetry).toBe(false)
  })

  it('erro desconhecido ainda produz algo compreensível', () => {
    const resultado = describeError(new Error('falha interna qualquer'))

    expect(resultado.title).toBe('Algo deu errado')
    expect(resultado.description).not.toContain('falha interna qualquer')
  })
})

describe('estado de carregamento', () => {
  it('anuncia o carregamento a quem usa leitor de tela', async () => {
    apiServer.use(
      http.get(`${API_URL}/users`, async () => {
        await delay(150)

        return HttpResponse.json(buildUserList())
      }),
    )
    renderAt()

    expect(await screen.findByText(/carregando usuários/i)).toBeInTheDocument()
    await screen.findByRole('table')
  })

  it('a região da lista é marcada como ocupada durante a busca', async () => {
    apiServer.use(
      http.get(`${API_URL}/users`, async () => {
        await delay(150)

        return HttpResponse.json(buildUserList())
      }),
    )
    const { container } = renderAt()

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    await screen.findByRole('table')
  })

  // O esqueleto ocupa a altura aproximada da tabela, evitando o salto de
  // layout quando os dados chegam.
  it('mostra espaço reservado no lugar da tabela na primeira carga', async () => {
    apiServer.use(
      http.get(`${API_URL}/users`, async () => {
        await delay(150)

        return HttpResponse.json(buildUserList())
      }),
    )
    const { container } = renderAt()

    expect(container.querySelector('.skeleton')).not.toBeNull()
    await screen.findByRole('table')
  })

  it('o espaço reservado fica fora da leitura por leitor de tela', async () => {
    apiServer.use(
      http.get(`${API_URL}/users`, async () => {
        await delay(150)

        return HttpResponse.json(buildUserList())
      }),
    )
    const { container } = renderAt()

    // Vinte linhas falsas lidas em voz alta seriam ruído; o aviso de
    // carregamento vem do aria-live, que é a informação útil.
    expect(container.querySelector('.skeleton')?.closest('[aria-hidden="true"]')).not.toBeNull()
    await screen.findByRole('table')
  })

  it('mantém a tabela anterior visível ao trocar de página', async () => {
    const user = userEvent.setup()
    apiServer.use(
      http.get(`${API_URL}/users`, async ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1')
        if (page > 1) await delay(300)

        return HttpResponse.json({
          data: [buildUser({ name: `Usuário da página ${page}` })],
          meta: { page, perPage: 20, total: 60, totalPages: 3 },
        })
      }),
    )
    renderAt()

    await screen.findByRole('link', { name: 'Usuário da página 1' })
    await user.click(screen.getByRole('button', { name: /próxima/i }))

    // A tabela antiga continua na tela enquanto a nova carrega, em vez de
    // piscar para um esqueleto.
    expect(screen.getByRole('link', { name: 'Usuário da página 1' })).toBeInTheDocument()
    expect(await screen.findByText(/atualizando resultados/i)).toBeInTheDocument()

    await screen.findByRole('link', { name: 'Usuário da página 2' })
  })
})

describe('estado de erro', () => {
  it('erro do servidor é anunciado como alerta', async () => {
    apiServer.use(http.get(`${API_URL}/users`, () => new HttpResponse(null, { status: 503 })))
    renderAt()

    const alerta = await screen.findByRole('alert')

    expect(alerta).toHaveTextContent(/servidor encontrou um problema/i)
  })

  it('falha de rede orienta a verificar a conexão', async () => {
    apiServer.use(http.get(`${API_URL}/users`, () => HttpResponse.error()))
    renderAt()

    expect(await screen.findByText(/verifique sua conexão/i)).toBeInTheDocument()
  })

  it('oferece repetir a operação', async () => {
    apiServer.use(http.get(`${API_URL}/users`, () => new HttpResponse(null, { status: 503 })))
    renderAt()

    expect(await screen.findByRole('button', { name: /tentar novamente/i })).toBeInTheDocument()
  })

  it('repetir recupera a tela quando a API volta', async () => {
    const user = userEvent.setup()
    let deveFalhar = true
    apiServer.use(
      http.get(`${API_URL}/users`, () =>
        deveFalhar
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json(buildUserList([buildUser({ name: 'Ana Souza' })])),
      ),
    )
    renderAt()

    await screen.findByRole('alert')
    deveFalhar = false
    await user.click(screen.getByRole('button', { name: /tentar novamente/i }))

    expect(await screen.findByRole('link', { name: 'Ana Souza' })).toBeInTheDocument()
  })

  it('não mostra tabela nem paginação junto do erro', async () => {
    apiServer.use(http.get(`${API_URL}/users`, () => new HttpResponse(null, { status: 503 })))
    renderAt()

    await screen.findByRole('alert')

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: /paginação/i })).not.toBeInTheDocument()
  })
})

/*
 * Lista vazia é resultado legítimo, não falha: anunciá-la como alerta
 * assustaria sem motivo. E a ação oferecida muda conforme a causa.
 */
describe('estado vazio', () => {
  function mockEmpty(): void {
    apiServer.use(
      http.get(`${API_URL}/users`, () =>
        HttpResponse.json({ data: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 0 } }),
      ),
    )
  }

  it('base vazia convida a cadastrar', async () => {
    mockEmpty()
    renderAt()

    expect(await screen.findByRole('heading', { name: /nenhum usuário cadastrado/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /cadastrar usuário/i })).toHaveAttribute(
      'href',
      '/users/new',
    )
  })

  it('busca sem resultado orienta a revisar o termo', async () => {
    mockEmpty()
    renderAt('/users?search=inexistente')

    expect(await screen.findByRole('heading', { name: /nenhum usuário encontrado/i })).toBeInTheDocument()
    expect(screen.getByText(/verifique a grafia/i)).toBeInTheDocument()
  })

  it('busca sem resultado oferece limpar a busca', async () => {
    const user = userEvent.setup()
    mockEmpty()
    renderAt('/users?search=inexistente')

    await user.click(await screen.findByRole('button', { name: /limpar busca/i }))

    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: /buscar/i })).toHaveValue('')
    })
  })

  // Oferecer "limpar busca" numa base vazia não ajudaria: não há busca ativa.
  it('a base vazia não oferece limpar busca', async () => {
    mockEmpty()
    renderAt()

    await screen.findByRole('heading', { name: /nenhum usuário cadastrado/i })

    expect(screen.queryByRole('button', { name: /limpar busca/i })).not.toBeInTheDocument()
  })

  it('a lista vazia não é anunciada como alerta', async () => {
    mockEmpty()
    renderAt()

    await screen.findByRole('heading', { name: /nenhum usuário cadastrado/i })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('não mostra paginação quando não há resultados', async () => {
    mockEmpty()
    renderAt()

    await screen.findByRole('heading', { name: /nenhum usuário cadastrado/i })

    expect(screen.queryByRole('navigation', { name: /paginação/i })).not.toBeInTheDocument()
  })
})
