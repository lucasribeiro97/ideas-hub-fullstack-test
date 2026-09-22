import { useEffect, useState } from 'react'
import { useDebouncedValue } from './useDebouncedValue.ts'

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
 * A sincronia na outra direção também importa: voltar pelo histórico ou abrir
 * um link com `?search=` precisa preencher o campo. É o que o efeito abaixo
 * garante.
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
  const debounced = useDebouncedValue(inputValue, delayMs)

  // Mudança vinda de fora do campo — histórico, link direto, limpeza de
  // filtros — precisa refletir no que está escrito.
  useEffect(() => {
    setInputValue(value)
  }, [value])

  useEffect(() => {
    // A comparação evita um ciclo: sem ela, o efeito reescreveria a URL com o
    // valor que acabou de vir dela.
    if (debounced !== value) onDebouncedChange(debounced)
    // `onDebouncedChange` é omitido de propósito: a função muda de identidade
    // a cada renderização, e incluí-la dispararia o efeito continuamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, value])

  return { inputValue, setInputValue }
}
