import axe, { type AxeResults, type Result } from 'axe-core'
import { expect } from 'vitest'

/**
 * Verificação automatizada de acessibilidade.
 *
 * O axe não substitui a verificação manual — ele encontra problemas
 * estruturais (rótulo ausente, contraste insuficiente, ordem de cabeçalhos),
 * mas não sabe se o fluxo faz sentido nem se a mensagem de erro é
 * compreensível. É uma rede contra regressão, não um atestado.
 */
export async function expectNoAxeViolations(container: HTMLElement): Promise<void> {
  const results: AxeResults = await axe.run(container, {
    // Regras que não se aplicam a um fragmento renderizado em teste: o
    // container não é a página inteira, então exigir landmark e região seria
    // falso positivo. As duas são verificadas no teste do layout completo.
    rules: {
      region: { enabled: false },
      'landmark-one-main': { enabled: false },
      'page-has-heading-one': { enabled: false },
    },
  })

  if (results.violations.length > 0) {
    throw new Error(formatViolations(results.violations))
  }

  expect(results.violations).toHaveLength(0)
}

function formatViolations(violations: Result[]): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes
        .map((node) => `      ${node.target.join(' ')}`)
        .join('\n')

      return [
        `  [${violation.impact ?? 'sem impacto'}] ${violation.id}: ${violation.help}`,
        `    ${violation.helpUrl}`,
        targets,
      ].join('\n')
    })
    .join('\n\n')
}
