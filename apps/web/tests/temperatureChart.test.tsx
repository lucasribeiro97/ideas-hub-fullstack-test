import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TemperatureChart } from '../src/components/TemperatureChart'
import { expectNoAxeViolations } from './helpers/axe'
import type { HourlyTemperature } from '../src/api/types'

function buildHourly(temperatures: number[]): HourlyTemperature[] {
  return temperatures.map((temperatureC, hour) => ({
    time: `2026-09-22 ${String(hour).padStart(2, '0')}:00`,
    temperatureC,
  }))
}

const DIA = buildHourly([
  18, 17.5, 17, 16.8, 16.5, 16.2, 16, 17, 19, 21, 23, 24.5,
  25, 25.5, 25.2, 24.8, 24, 23, 21.5, 20.5, 19.8, 19.2, 18.8, 18.4,
])

describe('resumo em texto', () => {
  /*
   * O resumo é o que um leitor de tela anuncia no lugar do traçado. Sem ele, o
   * gráfico seria um elemento mudo.
   */
  it('informa a mínima e a máxima com os respectivos horários', () => {
    render(<TemperatureChart hourly={DIA} city="São Paulo" />)

    const resumo = screen.getByText(/temperatura em são paulo/i)

    expect(resumo).toHaveTextContent('mínima de 16 °C às 06h')
    expect(resumo).toHaveTextContent('máxima de 25,5 °C às 13h')
  })

  it('o gráfico é anunciado como imagem com o mesmo resumo', () => {
    render(<TemperatureChart hourly={DIA} city="São Paulo" />)

    expect(screen.getByRole('img')).toHaveAccessibleName(/mínima de 16 °C/)
  })
})

/*
 * A dica que aparece ao passar o mouse complementa, mas não pode ser o único
 * caminho até o valor: quem usa teclado ou leitor de tela chega pela tabela.
 */
describe('equivalente em tabela', () => {
  it('traz uma linha por hora', () => {
    render(<TemperatureChart hourly={DIA} city="São Paulo" />)

    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(25)
  })

  it('cada linha relaciona hora e temperatura', () => {
    render(<TemperatureChart hourly={DIA} city="São Paulo" />)
    const linhas = within(screen.getByRole('table')).getAllByRole('row')

    expect(linhas[1]).toHaveTextContent('00h')
    expect(linhas[1]).toHaveTextContent('18 °C')
  })

  it('a tabela é alcançável por teclado', () => {
    render(<TemperatureChart hourly={DIA} city="São Paulo" />)

    // `details`/`summary` é focável e operável por teclado sem script.
    expect(screen.getByText(/ver os dados em tabela/i).tagName).toBe('SUMMARY')
  })
})

describe('casos de borda', () => {
  it('não renderiza nada quando não há série', () => {
    const { container } = render(<TemperatureChart hourly={[]} city="São Paulo" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('lida com uma única leitura', () => {
    render(<TemperatureChart hourly={buildHourly([20])} city="Recife" />)

    expect(screen.getByText(/mínima de 20 °C às 00h/)).toBeInTheDocument()
  })

  it('lida com temperatura constante ao longo do dia', () => {
    render(<TemperatureChart hourly={buildHourly(Array(24).fill(20))} city="Recife" />)

    const resumo = screen.getByText(/temperatura em recife/i)
    expect(resumo).toHaveTextContent('mínima de 20 °C')
    expect(resumo).toHaveTextContent('máxima de 20 °C')
  })

  it('lida com temperatura negativa', () => {
    render(<TemperatureChart hourly={buildHourly([-3, -1, 2])} city="Bariloche" />)

    expect(screen.getByText(/mínima de -3 °C/)).toBeInTheDocument()
  })
})

describe('acessibilidade do gráfico', () => {
  it('não tem violações', async () => {
    const { container } = render(<TemperatureChart hourly={DIA} city="São Paulo" />)

    await expectNoAxeViolations(container)
  }, 30_000)
})
