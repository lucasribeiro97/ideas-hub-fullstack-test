import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { HourlyTemperature } from '../api/types.ts'

const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function formatTemperature(celsius: number): string {
  return `${numberFormatter.format(celsius)} °C`
}

/** "2026-09-22 14:00" → "14h". O eixo não precisa da data, que é a do dia todo. */
function formatHour(time: string): string {
  return `${time.slice(11, 13)}h`
}

interface ChartPoint {
  hour: string
  time: string
  temperatureC: number
}

function toPoints(hourly: HourlyTemperature[]): ChartPoint[] {
  return hourly.map((entry) => ({
    hour: formatHour(entry.time),
    time: entry.time,
    temperatureC: entry.temperatureC,
  }))
}

interface Extremes {
  min: ChartPoint
  max: ChartPoint
}

function findExtremes(points: ChartPoint[]): Extremes | undefined {
  if (points.length === 0) return undefined

  return points.reduce<Extremes>(
    (accumulator, point) => ({
      min: point.temperatureC < accumulator.min.temperatureC ? point : accumulator.min,
      max: point.temperatureC > accumulator.max.temperatureC ? point : accumulator.max,
    }),
    { min: points[0] as ChartPoint, max: points[0] as ChartPoint },
  )
}

interface TooltipPayload {
  active?: boolean
  payload?: { payload: ChartPoint }[]
}

function ChartTooltip({ active, payload }: TooltipPayload) {
  const point = payload?.[0]?.payload
  if (active !== true || point === undefined) return null

  return (
    <div className="chart__tooltip">
      <strong>{formatTemperature(point.temperatureC)}</strong>
      <span>às {point.hour}</span>
    </div>
  )
}

interface TemperatureChartProps {
  hourly: HourlyTemperature[]
  city: string
}

/**
 * Variação da temperatura ao longo do dia.
 *
 * Série única, então uma cor só e sem legenda — o título já nomeia o que está
 * traçado. Marcas finas, grade em hairline sólido (tracejado leria como
 * projeção, não como grade) e rótulos diretos apenas nos extremos: um número
 * sobre cada um dos 24 pontos vira ruído e não é lido.
 *
 * O gráfico é `role="img"` com um resumo em texto, e a tabela abaixo é o
 * equivalente acessível completo. A dica de contexto que aparece ao passar o
 * mouse complementa, mas nunca é o único caminho até o valor — quem usa
 * teclado ou leitor de tela chega pela tabela.
 */
export function TemperatureChart({ hourly, city }: TemperatureChartProps) {
  const points = toPoints(hourly)
  const extremes = findExtremes(points)

  if (extremes === undefined) return null

  const resumo =
    `Temperatura em ${city} ao longo do dia: mínima de ${formatTemperature(extremes.min.temperatureC)} ` +
    `às ${extremes.min.hour} e máxima de ${formatTemperature(extremes.max.temperatureC)} às ${extremes.max.hour}.`

  return (
    <section className="chart" aria-labelledby="grafico-titulo">
      <h3 className="chart__title" id="grafico-titulo">
        Variação da temperatura hoje
      </h3>
      <p className="chart__summary">{resumo}</p>

      <div className="chart__plot" role="img" aria-label={resumo}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
            {/* Hairline sólido, um tom acima da superfície: a grade orienta,
                não compete com os dados. */}
            <CartesianGrid stroke="var(--chart-grid)" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="hour"
              stroke="var(--chart-axis)"
              tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
              tickLine={false}
              // Uma marca a cada três horas: 24 rótulos se sobrepõem em tela
              // estreita.
              interval={2}
            />
            <YAxis
              stroke="var(--chart-axis)"
              tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
              tickLine={false}
              width={56}
              tickFormatter={(value: number) => `${numberFormatter.format(value)}°`}
              // A escala acompanha o intervalo do dia, com folga de 2 graus.
              // O padrão do Recharts começa em zero, e isso espremeria a
              // variação real — de 12 a 23 graus — no terço superior do
              // gráfico, escondendo justamente o que se quer ver. Truncar a
              // escala seria enganoso num gráfico de barras, onde o
              // comprimento codifica magnitude a partir do zero; numa linha de
              // temperatura, que não tem zero significativo, o intervalo dos
              // dados é a referência correta.
              domain={[
                (dataMin: number) => Math.floor(dataMin - 2),
                (dataMax: number) => Math.ceil(dataMax + 2),
              ]}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
            />
            <Line
              type="monotone"
              dataKey="temperatureC"
              stroke="var(--chart-series-1)"
              strokeWidth={2}
              // Sem ponto em cada hora: a linha já mostra a forma, e 24 marcas
              // poluem. O ponto aparece ao aproximar o cursor, com área de
              // alcance maior que a marca.
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--color-surface)' }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/*
        O equivalente em tabela. Fica recolhido para não competir com o gráfico,
        mas existe na árvore de acessibilidade e é alcançável por teclado.
      */}
      <details className="chart__table">
        <summary>Ver os dados em tabela</summary>
        <div className="table-wrapper">
          <table>
            <caption className="visually-hidden">
              Temperatura por hora em {city}
            </caption>
            <thead>
              <tr>
                <th scope="col">Hora</th>
                <th scope="col">Temperatura</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.time}>
                  <th scope="row">{point.hour}</th>
                  <td className="numeric">{formatTemperature(point.temperatureC)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
