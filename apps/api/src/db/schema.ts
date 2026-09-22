import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

/**
 * Tabela de usuários (SPEC §7).
 *
 * `email` é `text` e não `citext`: a unicidade sem distinção de caixa vem de um
 * índice funcional sobre `lower(email)`, o que preserva no banco exatamente o
 * valor que veio da origem. Normalizar o valor gravado faria o dado divergir do
 * CSV importado.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // `$onUpdate` é do Drizzle, não do banco: garante que qualquer UPDATE
    // renove o campo sem depender de cada chamada lembrar de fazê-lo.
    //
    // Usa `now()` do Postgres em vez de `new Date()` do Node de propósito:
    // `created_at` vem do relógio do banco, e misturar as duas fontes faria
    // `updated_at` cair antes de `created_at` sempre que os relógios
    // divergissem — o que acontece quando API e banco rodam em máquinas
    // diferentes.
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    // Unicidade case-insensitive preservando o valor original (premissa P4).
    uniqueIndex('users_email_lower_unique').on(sql`lower(${table.email})`),

    // Busca parcial em qualquer posição da palavra. Sem estes índices,
    // `ILIKE '%termo%'` vira varredura sequencial sobre 1,6M de linhas.
    index('users_name_trgm_idx').using('gin', sql`${table.name} gin_trgm_ops`),
    index('users_email_trgm_idx').using('gin', sql`${table.email} gin_trgm_ops`),

    // Sustenta a ordenação padrão da listagem.
    index('users_created_at_desc_idx').on(table.createdAt.desc()),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
