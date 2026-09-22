import '@testing-library/jest-dom/vitest'

/*
 * jsdom não faz layout: todo elemento mede zero.
 *
 * Isso não é detalhe de configuração — é o motivo pelo qual o gráfico de
 * temperatura não era testado por nada. O `ResponsiveContainer` do Recharts só
 * desenha depois de medir o contêiner, e medindo zero ele não emite elemento
 * algum. Tudo o que vive dentro dele — a série, o domínio do eixo, o
 * formatador de rótulo, o tooltip — nunca executava em teste.
 *
 * A revisão provou o tamanho do buraco removendo o bloco `<ResponsiveContainer>`
 * inteiro do componente: os 231 testes continuaram passando, o mesmo número de
 * antes. Um gráfico podia sumir da aplicação sem nenhum teste falhar.
 *
 * As duas peças abaixo dão ao jsdom o mínimo para que a medição aconteça. Elas
 * ficam no setup, e não num arquivo de teste, porque valem para qualquer
 * componente que dependa de medir a si mesmo.
 */

const CHART_WIDTH = 800
const CHART_HEIGHT = 400

if (!('ResizeObserver' in globalThis)) {
  class ImmediateResizeObserver implements ResizeObserver {
    // Campo declarado e atribuído no corpo: `erasableSyntaxOnly` proíbe
    // parâmetro de construtor com modificador de acesso, que é sintaxe que só
    // existe em TypeScript e não some ao apagar os tipos.
    private readonly callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }

    observe(target: Element): void {
      // Entrega a medição de imediato: sem isso o Recharts fica esperando para
      // sempre por um evento de redimensionamento que o jsdom nunca emite.
      this.callback(
        [
          {
            target,
            contentRect: {
              width: CHART_WIDTH,
              height: CHART_HEIGHT,
              top: 0,
              left: 0,
              bottom: CHART_HEIGHT,
              right: CHART_WIDTH,
              x: 0,
              y: 0,
              toJSON: () => ({}),
            } as DOMRectReadOnly,
            borderBoxSize: [{ blockSize: CHART_HEIGHT, inlineSize: CHART_WIDTH }],
            contentBoxSize: [{ blockSize: CHART_HEIGHT, inlineSize: CHART_WIDTH }],
            devicePixelContentBoxSize: [{ blockSize: CHART_HEIGHT, inlineSize: CHART_WIDTH }],
          },
        ],
        this,
      )
    }

    unobserve(): void {}

    disconnect(): void {}
  }

  globalThis.ResizeObserver = ImmediateResizeObserver
}

for (const [property, value] of [
  ['offsetWidth', CHART_WIDTH],
  ['offsetHeight', CHART_HEIGHT],
  ['clientWidth', CHART_WIDTH],
  ['clientHeight', CHART_HEIGHT],
] as const) {
  Object.defineProperty(HTMLElement.prototype, property, {
    configurable: true,
    value,
  })
}
