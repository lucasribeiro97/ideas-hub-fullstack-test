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
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
