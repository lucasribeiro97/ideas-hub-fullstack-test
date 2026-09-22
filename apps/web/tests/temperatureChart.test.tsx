import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TemperatureChart } from '../src/components/TemperatureChart'
import { domainCeiling, domainFloor } from '../src/lib/chartDomain'
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


/*
 * O traçado, e não só o texto ao redor dele.
 *
 * Os casos acima afirmam sobre o parágrafo de resumo e sobre a tabela em
 * `<details>` — os dois independentes do gráfico. A revisão mostrou o tamanho
 * do buraco removendo o bloco `<ResponsiveContainer>` inteiro do componente:
 * os 231 testes continuaram passando, o mesmo número de antes. O gráfico podia
 * sumir da aplicação sem nenhum teste falhar.
 *
 * A causa era o jsdom não fazer layout: o `ResponsiveContainer` media zero e o
 * Recharts não emitia nada. O `tests/setup.ts` passou a fornecer a medição.
 */
describe('traçado do gráfico', () => {
  function renderChart(temperatures: number[]) {
    return render(<TemperatureChart hourly={buildHourly(temperatures)} city="Recife" />)
  }

  it('a série é desenhada', () => {
    const { container } = renderChart([18, 20, 23, 21, 19])

    expect(container.querySelector('.recharts-line-curve')).not.toBeNull()
  })

  it('a linha usa a cor validada da paleta, e não a cor padrão da biblioteca', () => {
    const { container } = renderChart([18, 20, 23])

    // A cor passou pelo validador de paleta contra as nossas superfícies; um
    // padrão da biblioteca não passou por verificação nenhuma.
    expect(container.querySelector('.recharts-line-curve')).toHaveAttribute(
      'stroke',
      'var(--chart-series-1)',
    )
  })

  it('o eixo vertical se ajusta aos dados em vez de começar no zero', () => {
    // Começar em zero espremeria a variação real — de 12 a 23 graus — no terço
    // superior do gráfico, escondendo justamente o que se quer ver. Truncar a
    // escala seria enganoso num gráfico de barras, onde o comprimento codifica
    // magnitude a partir do zero; numa linha de temperatura, que não tem zero
    // significativo, o intervalo dos dados é a referência correta.
    expect(domainFloor(12)).toBe(10)
    expect(domainCeiling(23)).toBe(25)
    expect(domainFloor(12)).toBeGreaterThan(0)
  })

  it('o domínio arredonda para fora, nunca cortando um valor real', () => {
    expect(domainFloor(18.4)).toBeLessThanOrEqual(18.4)
    expect(domainCeiling(23.1)).toBeGreaterThanOrEqual(23.1)
  })

  it('o eixo horizontal rotula as horas sem imprimir as 24', () => {
    const { container } = renderChart(Array.from({ length: 24 }, (_unused, hour) => 18 + hour * 0.2))

    const ticks = container.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick')

    expect(ticks.length).toBeGreaterThan(0)
    expect(ticks.length).toBeLessThan(24)
  })

  it('a grade existe e não compete com os dados', () => {
    const { container } = renderChart([18, 20, 22])

    // Grade horizontal apenas: linhas verticais a cada hora dobrariam a tinta
    // sem acrescentar leitura.
    expect(container.querySelector('.recharts-cartesian-grid-horizontal')).not.toBeNull()
    expect(container.querySelector('.recharts-cartesian-grid-vertical')).toBeNull()
  })

  it('um ponto só continua desenhando sem quebrar', () => {
    const { container } = renderChart([21])

    expect(container.querySelector('.recharts-surface')).not.toBeNull()
  })

  it('valores todos iguais não achatam o gráfico contra a borda', () => {
    const { container } = renderChart([20, 20, 20, 20])

    expect(container.querySelector('.recharts-line-curve')).not.toBeNull()
    // Com o domínio colado no dado, o eixo não teria altura e a linha ficaria
    // sobre a borda.
    expect(domainCeiling(20) - domainFloor(20)).toBeGreaterThan(0)
  })
})
