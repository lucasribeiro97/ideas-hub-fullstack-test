import { asc, desc, ilike, or, type SQL } from 'drizzle-orm'
import { users } from '../../db/schema.js'
import { SORTABLE_FIELDS } from './users.schemas.js'

/**
 * Escapa os curingas do `LIKE` para que a busca trate o termo como texto
 * literal.
 *
 * Sem isso, procurar por `50%` casaria com qualquer nome começando em "50", e
 * `a_b` casaria com "aXb" — resultado errado e silencioso. O `_` é
 * especialmente traiçoeiro por ser comum em endereços de email.
 */
export function escapeLikeWildcards(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** Filtro parcial, sem distinção de caixa, em nome **ou** email (SPEC §6). */
export function buildSearchCondition(search: string | undefined): SQL | undefined {
  if (!search) return undefined

  const pattern = `%${escapeLikeWildcards(search)}%`

  return or(ilike(users.name, pattern), ilike(users.email, pattern))
}

const SORT_COLUMNS = {
  name: users.name,
  email: users.email,
  createdAt: users.createdAt,
} as const satisfies Record<(typeof SORTABLE_FIELDS)[number], unknown>

/**
 * Ordenação da listagem, sempre com desempate por `id`.
 *
 * O desempate não é enfeite: `name` e `createdAt` admitem valores repetidos, e
 * sem um critério final determinístico o Postgres pode devolver linhas
 * empatadas em ordem diferente a cada consulta. Numa listagem paginada isso
 * faz o mesmo usuário aparecer em duas páginas enquanto outro some.
 */
export function buildOrderBy(
  sort: (typeof SORTABLE_FIELDS)[number],
  order: 'asc' | 'desc',
): SQL[] {
  const column = SORT_COLUMNS[sort]
  const direction = order === 'asc' ? asc : desc

  return [direction(column), asc(users.id)]
}
