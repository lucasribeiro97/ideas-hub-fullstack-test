import { useEffect, useState } from 'react'

/**
 * Devolve o valor apenas após ele ficar estável pelo tempo informado.
 *
 * Usado para separar o que a pessoa vê do que a aplicação consulta: o campo
 * de busca responde a cada tecla, mas a requisição só parte quando a digitação
 * para (critério S12).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value)
    }, delayMs)

    // Cada tecla cancela o temporizador anterior. É o que faz "souza" produzir
    // uma consulta em vez de cinco.
    return () => {
      clearTimeout(timer)
    }
  }, [value, delayMs])

  return debounced
}
