/**
 * Extremos do eixo vertical do gráfico de temperatura.
 *
 * Moram fora do componente por dois motivos. O primeiro é que exportar função
 * de um arquivo de componente quebra o Fast Refresh, e o lint avisa. O segundo
 * é o que importa: esta é uma decisão de leitura, não um detalhe de
 * configuração, e em jsdom o Recharts não emite os rótulos do eixo — a única
 * forma honesta de verificá-la é chamando a função.
 *
 * Começar em zero espremeria a variação real — de 12 a 23 graus — no terço
 * superior do gráfico, escondendo justamente o que se quer ver. Truncar a
 * escala seria enganoso num gráfico de barras, onde o comprimento codifica
 * magnitude a partir do zero; numa linha de temperatura, que não tem zero
 * significativo, o intervalo dos dados é a referência correta.
 *
 * A folga de dois graus mantém a linha longe das bordas e resolve o caso
 * degenerado de todos os valores iguais, em que um domínio colado no dado
 * produziria um eixo sem altura.
 */
const AXIS_PADDING_C = 2

export function domainFloor(dataMin: number): number {
  return Math.floor(dataMin - AXIS_PADDING_C)
}

export function domainCeiling(dataMax: number): number {
  return Math.ceil(dataMax + AXIS_PADDING_C)
}
