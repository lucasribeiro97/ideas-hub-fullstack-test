import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * Recusa um pacote de produção que contenha o React de desenvolvimento.
 *
 * Roda ao final de `npm run build`. Existe porque essa falha não se manifesta
 * como erro: o pacote é gerado, a aplicação funciona, e a única pista é o
 * tamanho — 920 KB em vez de 672 KB. O que muda é invisível até doer: as
 * verificações de desenvolvimento do React ficam ativas em produção, e o
 * `StrictMode` monta cada tela duas vezes, cancelando a primeira requisição de
 * cada uma delas.
 *
 * A causa original: `NODE_ENV=development` no `.env` da raiz, escrito para a
 * API. O Vite lê o mesmo arquivo (`envDir`) e respeita `NODE_ENV` vindo dele.
 * Tirar a variável de lá resolveu — e esta verificação garante que nenhuma
 * outra porta de entrada reabra o problema em silêncio.
 */

const distDir = path.resolve(fileURLToPath(new URL('../dist/assets', import.meta.url)))

/*
 * `bundleType` é a declaração do próprio React ao conectar-se ao DevTools:
 * 0 para o pacote de produção, 1 para o de desenvolvimento. É mais confiável
 * que procurar textos de aviso, que mudam de versão para versão.
 */
const PRODUCTION_BUNDLE_TYPE = 'bundleType:0'
const DEVELOPMENT_BUNDLE_TYPE = 'bundleType:1'

const files = (await readdir(distDir)).filter((name) => name.endsWith('.js'))

if (files.length === 0) {
  console.error('check-build: nenhum arquivo .js encontrado em dist/assets.')
  process.exit(1)
}

let declaration

for (const name of files) {
  const content = await readFile(path.join(distDir, name), 'utf8')

  if (content.includes(DEVELOPMENT_BUNDLE_TYPE)) {
    console.error(
      [
        `check-build: ${name} contém o React de DESENVOLVIMENTO.`,
        '',
        'Causa mais provável: NODE_ENV=development chegando ao Vite — pelo',
        'ambiente ou por um arquivo .env lido via envDir (o da raiz do',
        'repositório). NODE_ENV pertence ao processo, não ao .env compartilhado.',
      ].join('\n'),
    )
    process.exit(1)
  }

  if (content.includes(PRODUCTION_BUNDLE_TYPE)) declaration = name
}

if (declaration === undefined) {
  // Nem produção nem desenvolvimento: o marcador mudou de forma, e continuar
  // seria dizer "verificado" sem ter verificado nada.
  console.error(
    'check-build: nenhum pacote declarou bundleType. O marcador do React mudou;\n' +
      'esta verificação precisa ser revista antes de voltar a valer.',
  )
  process.exit(1)
}

console.log(`check-build: ${declaration} traz o React de produção.`)
