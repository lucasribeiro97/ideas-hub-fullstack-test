import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from '../src/App'
import { createQueryClient } from '../src/lib/queryClient'
import { expectNoAxeViolations } from './helpers/axe'
import { API_URL, apiServer } from './helpers/api-server'
import type { Weather } from '../src/api/types'

beforeAll(() => {
  apiServer.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  apiServer.resetHandlers()
})

afterAll(() => {
  apiServer.close()
})

function buildWeather(overrides: Partial<Weather> = {}): Weather {
  return {
    city: 'São Paulo',
    region: 'Sao Paulo',
    country: 'Brazil',
    current: {
      temperatureC: 24.1,
      feelsLikeC: 25.3,
      humidity: 65,
      condition: 'Parcialmente nublado',
      observedAt: '2026-09-22 12:45',
    },
    hourly: Array.from({ length: 24 }, (_unused, hour) => ({
      time: `2026-09-22 ${String(hour).padStart(2, '0')}:00`,
      temperatureC: 18 + hour * 0.3,
    })),
    cache: { hit: false, stale: false, fetchedAt: '2026-09-22T12:45:00.000Z' },
    ...overrides,
  }
}

let requestedCities: string[] = []

function mockWeather(response: () => Response | Promise<Response>): void {
  requestedCities = []
  apiServer.use(
    http.get(`${API_URL}/weather/:city`, ({ params }) => {
      requestedCities.push(decodeURIComponent(params['city'] as string))

      return response()
    }),
  )
}

function renderAt(route = '/weather') {
  return render(
    <QueryClientProvider client={createQueryClient({ queries: { retry: false } })}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('estado inicial', () => {
  it('não consulta antes de a cidade ser informada', async () => {
    mockWeather(() => HttpResponse.json(buildWeather()))
    renderAt()

    expect(await screen.findByText(/informe uma cidade/i)).toBeInTheDocument()
    // Sem isso, abrir a tela dispararia uma requisição com nome vazio, que a
    // API recusaria com 400.
    expect(requestedCities).toHaveLength(0)
  })

  it('a cidade da URL é consultada e aparece no campo', async () => {
    mockWeather(() => HttpResponse.json(buildWeather()))
    renderAt('/weather?city=São Paulo')

    expect(await screen.findByRole('heading', { name: /são paulo/i })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /cidade/i })).toHaveValue('São Paulo')
  })
})

describe('consulta', () => {
  /*
   * Busca por envio explícito, e não com debounce como na listagem: cada
   * consulta atravessa para um serviço externo com cota, e disparar a cada
   * pausa gastaria requisições em nomes incompletos.
   */
  it('não consulta enquanto se digita', async () => {
    const user = userEvent.setup()
    mockWeather(() => HttpResponse.json(buildWeather()))
    renderAt()

    await user.type(screen.getByRole('searchbox', { name: /cidade/i }), 'São Paulo')
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(requestedCities).toHaveLength(0)
  })

  it('consulta ao enviar o formulário', async () => {
    const user = userEvent.setup()
    mockWeather(() => HttpResponse.json(buildWeather()))
    renderAt()

    await user.type(screen.getByRole('searchbox', { name: /cidade/i }), 'São Paulo')
    await user.click(screen.getByRole('button', { name: /consultar/i }))

    await waitFor(() => {
      expect(requestedCities).toEqual(['São Paulo'])
    })
  })

  it('Enter no campo também consulta', async () => {
    const user = userEvent.setup()
    mockWeather(() => HttpResponse.json(buildWeather()))
    renderAt()

    await user.type(screen.getByRole('searchbox', { name: /cidade/i }), 'Recife{Enter}')

    await waitFor(() => {
      expect(requestedCities).toEqual(['Recife'])
    })
  })

  it('a cidade consultada vai para a URL, tornando o resultado compartilhável', async () => {
    const user = userEvent.setup()
    mockWeather(() => HttpResponse.json(buildWeather()))
    renderAt()

    await user.type(screen.getByRole('searchbox', { name: /cidade/i }), 'Recife{Enter}')

    await screen.findByRole('heading', { name: /são paulo/i })
    expect(screen.getByRole('searchbox', { name: /cidade/i })).toHaveValue('Recife')
  })

  it('remove espaços em volta do nome', async () => {
    const user = userEvent.setup()
    mockWeather(() => HttpResponse.json(buildWeather()))
    renderAt()

    await user.type(screen.getByRole('searchbox', { name: /cidade/i }), '   Recife   {Enter}')

    await waitFor(() => {
      expect(requestedCities).toEqual(['Recife'])
    })
  })
})

describe('exibição do resultado', () => {
  it('mostra temperatura, condição e umidade', async () => {
    mockWeather(() => HttpResponse.json(buildWeather()))
    renderAt('/weather?city=São Paulo')

    expect(await screen.findByText('24,1 °C')).toBeInTheDocument()
    expect(screen.getByText('Parcialmente nublado')).toBeInTheDocument()
    expect(screen.getByText('65%')).toBeInTheDocument()
  })

  it('mostra a sensação térmica', async () => {
    mockWeather(() => HttpResponse.json(buildWeather()))
    renderAt('/weather?city=São Paulo')

    expect(await screen.findByText('25,3 °C')).toBeInTheDocument()
  })

  /*
   * Premissa P7: a WeatherAPI faz correspondência aproximada. "sao pualo"
   * devolve "Sao Sao, Chad" com status 200. Exibir a localidade resolvida em
   * destaque é o único meio de quem consultou perceber que recebeu o lugar
   * errado.
   */
  it('exibe a localidade resolvida, e não o texto digitado', async () => {
    mockWeather(() =>
      HttpResponse.json(buildWeather({ city: 'Sao Sao', region: '', country: 'Chad' })),
    )
    renderAt('/weather?city=sao pualo')

    const titulo = await screen.findByRole('heading', { name: /sao sao/i })

    expect(titulo).toHaveTextContent('Sao Sao')
    expect(titulo).toHaveTextContent('Chad')
  })

  it('inclui a região quando a origem a informa', async () => {
    mockWeather(() => HttpResponse.json(buildWeather()))
    renderAt('/weather?city=São Paulo')

    expect(await screen.findByRole('heading', { name: /são paulo/i })).toHaveTextContent(
      'Sao Paulo · Brazil',
    )
  })

  it('formata o horário da observação, que vem sem fuso da origem', async () => {
    mockWeather(() => HttpResponse.json(buildWeather()))
    renderAt('/weather?city=São Paulo')

    // "2026-09-22 12:45" interpretado direto por `new Date` viraria data
    // inválida em alguns navegadores.
    expect(await screen.findByText('12:45')).toBeInTheDocument()
  })
})

/*
 * Cidade inexistente e falha do serviço são situações diferentes e pedem
 * mensagens diferentes — requisito explícito do aceite.
 */
describe('cidade não encontrada', () => {
  function mockNotFound(): void {
    mockWeather(() =>
      HttpResponse.json(
        { error: { code: 'WEATHER_CITY_NOT_FOUND', message: 'Cidade não encontrada.' } },
        { status: 404 },
      ),
    )
  }

  it('orienta a revisar o nome', async () => {
    mockNotFound()
    renderAt('/weather?city=xyzabc')

    expect(await screen.findByRole('heading', { name: /cidade não encontrada/i })).toBeInTheDocument()
    expect(screen.getByText(/verifique a grafia/i)).toBeInTheDocument()
  })

  it('repete o termo consultado na mensagem', async () => {
    mockNotFound()
    renderAt('/weather?city=xyzabc')

    expect(await screen.findByText(/xyzabc/)).toBeInTheDocument()
  })

  // Insistir devolveria o mesmo 404.
  it('não oferece repetir a consulta', async () => {
    mockNotFound()
    renderAt('/weather?city=xyzabc')

    await screen.findByRole('heading', { name: /cidade não encontrada/i })

    expect(screen.queryByRole('button', { name: /tentar novamente/i })).not.toBeInTheDocument()
  })
})

describe('falha do serviço', () => {
  it('tem mensagem diferente da de cidade inexistente', async () => {
    mockWeather(() => new HttpResponse(null, { status: 502 }))
    renderAt('/weather?city=São Paulo')

    const alerta = await screen.findByRole('alert')

    expect(alerta).not.toHaveTextContent(/cidade não encontrada/i)
    expect(alerta).toHaveTextContent(/servidor/i)
  })

  it('oferece repetir, porque repetir pode resolver', async () => {
    mockWeather(() => new HttpResponse(null, { status: 502 }))
    renderAt('/weather?city=São Paulo')

    expect(await screen.findByRole('button', { name: /tentar novamente/i })).toBeInTheDocument()
  })

  it('repetir recupera a tela quando o serviço volta', async () => {
    const user = userEvent.setup()
    let deveFalhar = true
    mockWeather(() =>
      deveFalhar ? new HttpResponse(null, { status: 502 }) : HttpResponse.json(buildWeather()),
    )
    renderAt('/weather?city=São Paulo')

    await screen.findByRole('alert')
    deveFalhar = false
    await user.click(screen.getByRole('button', { name: /tentar novamente/i }))

    expect(await screen.findByText('24,1 °C')).toBeInTheDocument()
  })

  it('timeout orienta a tentar de novo', async () => {
    mockWeather(() =>
      HttpResponse.json(
        { error: { code: 'WEATHER_TIMEOUT', message: 'O serviço demorou a responder.' } },
        { status: 504 },
      ),
    )
    renderAt('/weather?city=São Paulo')

    expect(await screen.findByRole('alert')).toHaveTextContent(/servidor/i)
  })
})

/*
 * A política stale-if-error da API devolve 200 com a última leitura conhecida
 * quando a origem está fora do ar. Sem sinalizar, a temperatura de trinta
 * minutos atrás passaria por atual.
 */
describe('dado servido de cache expirado', () => {
  it('avisa que a leitura não é de agora', async () => {
    mockWeather(() =>
      HttpResponse.json(
        buildWeather({
          cache: { hit: true, stale: true, fetchedAt: '2026-09-22T12:00:00.000Z' },
        }),
      ),
    )
    renderAt('/weather?city=São Paulo')

    const aviso = await screen.findByRole('status')

    expect(aviso).toHaveTextContent(/indisponível/i)
    expect(aviso).toHaveTextContent(/última leitura/i)
  })

  it('mostra os dados mesmo assim, em vez de uma tela de erro', async () => {
    mockWeather(() =>
      HttpResponse.json(
        buildWeather({
          cache: { hit: true, stale: true, fetchedAt: '2026-09-22T12:00:00.000Z' },
        }),
      ),
    )
    renderAt('/weather?city=São Paulo')

    expect(await screen.findByText('24,1 °C')).toBeInTheDocument()
  })

  it('não avisa quando o dado é atual', async () => {
    mockWeather(() => HttpResponse.json(buildWeather()))
    renderAt('/weather?city=São Paulo')

    await screen.findByText('24,1 °C')

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('acessibilidade da tela de clima', () => {
  it('o resultado não tem violações', async () => {
    mockWeather(() => HttpResponse.json(buildWeather()))
    const { container } = renderAt('/weather?city=São Paulo')

    await screen.findByText('24,1 °C')

    await expectNoAxeViolations(container)
  }, 30_000)

  it('a cidade não encontrada não tem violações', async () => {
    mockWeather(() =>
      HttpResponse.json(
        { error: { code: 'WEATHER_CITY_NOT_FOUND', message: 'Cidade não encontrada.' } },
        { status: 404 },
      ),
    )
    const { container } = renderAt('/weather?city=xyzabc')

    await screen.findByRole('heading', { name: /cidade não encontrada/i })

    await expectNoAxeViolations(container)
  }, 30_000)

  it('a consulta é operável só com teclado', async () => {
    const user = userEvent.setup()
    mockWeather(() => HttpResponse.json(buildWeather()))
    renderAt()

    screen.getByRole('searchbox', { name: /cidade/i }).focus()
    await user.keyboard('Recife{Enter}')

    await waitFor(() => {
      expect(requestedCities).toEqual(['Recife'])
    })
  })
})
