import { cp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * Copia as migrations para o pacote compilado.
 *
 * O `tsc` só emite TypeScript compilado; os `.sql` e o `meta/_journal.json` do
 * Drizzle, que são o conteúdo das migrations, ficariam de fora e
 * `node dist/db/migrate.js` falharia ao ser executado pela plataforma.
 *
 * É um script Node, e não `cp -r` no `package.json`, porque o comando de cópia
 * difere entre sistemas operacionais e o build precisa funcionar igual em
 * qualquer máquina que for publicar.
 */

const source = fileURLToPath(new URL('../src/db/migrations', import.meta.url))
const destination = fileURLToPath(new URL('../dist/db/migrations', import.meta.url))

// Remove antes de copiar: sem isto, uma migration renomeada deixaria a versão
// antiga para trás e o journal deixaria de bater com os arquivos.
await rm(destination, { recursive: true, force: true })
await cp(source, destination, { recursive: true })

console.log(`copy-migrations: ${path.basename(source)} copiado para dist/db/`)
