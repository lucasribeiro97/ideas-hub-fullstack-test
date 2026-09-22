import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // Mantém o SQL gerado legível para revisão: as migrations são versionadas e
  // lidas por quem avalia o projeto, não apenas executadas.
  verbose: true,
  strict: true,
})
