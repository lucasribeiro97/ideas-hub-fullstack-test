import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * Recusa um `dist/` que não consiga aplicar migrations.
 *
 * Roda ao final de `npm run build`. Existe porque a falha é invisível no
 * desenvolvimento: `npm run db:migrate` usa `tsx` sobre a árvore de fontes,
 * então as migrations sempre funcionam aqui — e quebram na primeira
 * publicação, quando a plataforma executa o pacote compilado.
 *
 * O `tsc` compila `.ts` e ignora tudo o mais. Os arquivos `.sql` e o
 * `meta/_journal.json` do Drizzle, que são o conteúdo das migrations, ficavam
 * de fora, e `node dist/db/migrate.js` terminava com
 * `Can't find meta/_journal.json file`.
 */

const distDir = path.resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const migrationsDir = path.join(distDir, 'db', 'migrations')

function fail(message) {
  console.error(`check-build: ${message}`)
  process.exit(1)
}

let migrations
try {
  migrations = await readdir(migrationsDir)
} catch {
  fail(
    'dist/db/migrations não existe. O `tsc` não copia arquivos que não sejam\n' +
      'TypeScript; a cópia é feita por `scripts/copy-migrations.mjs`, chamado pelo build.',
  )
}

const sqlFiles = migrations.filter((name) => name.endsWith('.sql'))

if (sqlFiles.length === 0) {
  fail('dist/db/migrations não contém nenhum arquivo .sql.')
}

/*
 * O journal é o índice do Drizzle: sem ele o migrador não sabe o que já foi
 * aplicado e recusa a operação inteira, mesmo com os .sql presentes.
 */
const journalPath = path.join(migrationsDir, 'meta', '_journal.json')

let journal
try {
  journal = JSON.parse(await readFile(journalPath, 'utf8'))
} catch {
  fail(`${path.relative(distDir, journalPath)} ausente ou ilegível.`)
}

const entries = Array.isArray(journal.entries) ? journal.entries : []

if (entries.length !== sqlFiles.length) {
  fail(
    `o journal lista ${entries.length} migration(s) e há ${sqlFiles.length} arquivo(s) .sql.\n` +
      'Um dos dois foi copiado pela metade, e o descompasso só apareceria ao publicar.',
  )
}

console.log(`check-build: dist/ traz ${sqlFiles.length} migration(s) e o journal.`)
