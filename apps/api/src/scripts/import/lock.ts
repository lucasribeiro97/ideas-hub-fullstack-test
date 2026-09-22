import type { Pool } from 'pg'

/**
 * Chave do lock consultivo que serializa a importação.
 *
 * O valor é arbitrário; o que importa é ser estável entre execuções e não
 * colidir com outro uso de lock consultivo no mesmo banco. Não há outro neste
 * projeto.
 */
export const IMPORT_LOCK_KEY = 6182930465129001

export class ImportAlreadyRunningError extends Error {
  constructor() {
    super(
      'Já existe uma importação em andamento neste banco. ' +
        'Aguarde ela terminar antes de iniciar outra.',
    )
    this.name = 'ImportAlreadyRunningError'
  }
}

export interface ImportLock {
  release: () => Promise<void>
}

/**
 * Impede duas importações simultâneas contra o mesmo banco.
 *
 * A tabela de rascunho tem nome fixo e global (`staging.ts`). Duas execuções
 * concorrentes a compartilham: o `TRUNCATE` de uma apaga o que a outra já
 * copiou, e o `DROP` do encerramento de uma derruba a tabela sob os pés da
 * outra. O desfecho ruim não é o erro de SQL — é a execução que sobrevive
 * fazer o merge sobre dados alheios e relatar esses números como seus, com a
 * conferência das contagens fechando.
 *
 * O lock é consultivo, e não uma linha de controle numa tabela, porque o
 * Postgres o libera sozinho quando a conexão cai. Um processo morto com
 * `kill -9` não deixa a importação travada para sempre — que é exatamente o
 * modo de falha de um travamento implementado à mão.
 *
 * O lock vive numa conexão dedicada, tomada do pool e segurada até o fim: lock
 * consultivo em nível de sessão pertence à conexão que o adquiriu, e
 * `pool.query` não garante repetir a mesma conexão.
 */
export async function acquireImportLock(pool: Pool): Promise<ImportLock> {
  const client = await pool.connect()

  let acquired = false
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [IMPORT_LOCK_KEY],
    )

    // `try` e não a versão bloqueante: enfileirar em silêncio esconderia o
    // engano de quem disparou a segunda execução por achar que a primeira
    // havia travado.
    acquired = rows[0]?.locked === true

    if (!acquired) throw new ImportAlreadyRunningError()
  } finally {
    if (!acquired) client.release()
  }

  return {
    release: async () => {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [IMPORT_LOCK_KEY])
      } finally {
        client.release()
      }
    },
  }
}
