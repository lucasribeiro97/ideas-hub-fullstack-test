import { useEffect } from 'react'

const SUFIXO = 'Ideas Hub'

/**
 * Atualiza o título da página a cada navegação.
 *
 * Numa aplicação de página única o título não muda sozinho. Sem isso, quem usa
 * leitor de tela não recebe anúncio da mudança de contexto, e o histórico do
 * navegador fica com entradas indistinguíveis.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title.length > 0 ? `${title} · ${SUFIXO}` : SUFIXO
  }, [title])
}
