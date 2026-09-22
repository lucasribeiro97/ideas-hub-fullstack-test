import { useEffect, useRef, useState } from 'react'

/** Tempo entre a última tecla e a consulta. */
export const SEARCH_DEBOUNCE_MS = 300

interface UseSearchInputOptions {
  /** Busca vigente, vinda da URL. */
  value: string
  onDebouncedChange: (search: string) => void
  delayMs?: number
}

/**
 * Liga o campo de busca à URL sem disparar consulta por tecla.
 *
 * Há estado local aqui, e isso é deliberado apesar de a URL ser a fonte de
 * verdade: o campo precisa responder imediatamente ao que se digita, enquanto
 * a URL e a consulta só acompanham quando a digitação para. Sem a separação,
 * ou o campo fica travado esperando o debounce, ou a URL recebe uma entrada
 * por tecla.
 *
 * O temporizador vive no manipulador de mudança, e não num efeito sobre um
 * valor derivado. A diferença importa: uma mudança vinda de fora — botão de
 * limpar, histórico, link direto — **cancela a propagação pendente**. Na
 * versão anterior, o temporizador antigo ainda carregava o texto velho e
 * reescrevia a URL logo depois de ela ter sido limpa, desfazendo a ação.
 */
export function useSearchInput({
  value,
  onDebouncedChange,
  delayMs = SEARCH_DEBOUNCE_MS,
}: UseSearchInputOptions): {
  inputValue: string
  setInputValue: (next: string) => void
} {
  const [inputValue, setInputValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const cancelPending = (): void => {
    if (timerRef.current !== undefined) clearTimeout(timerRef.current)
    timerRef.current = undefined
  }

  // Mudança vinda de fora do campo precisa refletir no que está escrito, e
  // descartar qualquer propagação ainda em espera.
  //
  // A regra `react/set-state-in-effect` está desligada para este arquivo no
  // .oxlintrc.json, e o alerta é pertinente na maioria dos casos. Aqui a URL é
  // um sistema externo à árvore React, e sincronizar com sistema externo é
  // exatamente o uso para o qual os efeitos existem. As alternativas seriam
  // ajustar estado durante a renderização — que exigiria limpar o temporizador
  // numa função impura — ou remontar o campo por `key`, que faria perder o
  // foco a cada navegação.
  useEffect(() => {
    cancelPending()
    setInputValue(value)
  }, [value])

  // Temporizador pendente não deve disparar depois de a tela sair.
  useEffect(() => cancelPending, [])

  const handleChange = (next: string): void => {
    setInputValue(next)
    cancelPending()

    timerRef.current = setTimeout(() => {
      timerRef.current = undefined
      onDebouncedChange(next)
    }, delayMs)
  }

  return { inputValue, setInputValue: handleChange }
}
