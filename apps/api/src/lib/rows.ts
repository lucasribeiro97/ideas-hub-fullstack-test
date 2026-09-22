/**
 * Extrai a primeira linha de um retorno do banco.
 *
 * O Drizzle tipa `returning()` como array, então todo `insert`/`update` que
 * devolve uma linha precisa estreitar o tipo. Centralizar isso evita repetir a
 * mesma guarda em cada operação e dá um único lugar para testá-la.
 *
 * A ausência de linha é erro de programação, não condição de negócio: em
 * `insert ... returning` ela não acontece, mas em `onConflictDoNothing` sim, e
 * aí quem chama precisa tratar antes de usar este helper.
 */
export function firstOrThrow<T>(rows: T[], message: string): T {
  const [first] = rows

  if (first === undefined) throw new Error(message)

  return first
}
