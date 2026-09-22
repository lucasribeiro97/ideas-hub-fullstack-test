import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'

export type Database = NodePgDatabase<typeof schema>

/**
 * Cria um pool e a instância do Drizzle sobre ele.
 *
 * O pool é devolvido junto porque quem o cria é quem precisa fechá-lo: o
 * servidor no encerramento, e cada suíte de teste ao final. Esconder o pool
 * levaria a conexões penduradas nos testes.
 */
export interface CreateDatabaseOptions {
  /**
   * Chamado quando uma conexão **ociosa** falha. Recebe o erro para registro;
   * o descarte da conexão é feito pelo próprio `pg`.
   */
  onPoolError?: (error: Error) => void

  /**
   * Tempo máximo de uma consulta, em milissegundos. Omitir significa sem
   * limite.
   *
   * É opcional, e não um padrão global, porque os dois usos têm necessidades
   * opostas: a API precisa que nenhuma consulta monopolize uma conexão, e a
   * importação faz um único merge que leva dezenas de minutos. Um valor herdado
   * mataria a importação no meio.
   */
  statementTimeoutMs?: number
}

/**
 * Registra o ouvinte antes de qualquer consulta.
 *
 * O `pg-pool` emite `'error'` no pool quando um cliente que está ocioso falha
 * — não existe requisição em andamento para receber a exceção. Sem ouvinte, o
 * `EventEmitter` do Node converte isso em exceção não capturada e **o processo
 * inteiro morre**, não a requisição.
 *
 * Os gatilhos são rotineiros: reinício do Postgres, failover,
 * `pg_terminate_backend` de quem administra o banco, `idle_session_timeout` no
 * cluster, queda de rota numa conexão parada. O pool guarda conexões ociosas
 * por 10 segundos (padrão do `pg`), então sob tráfego contínuo a exposição é
 * permanente.
 *
 * O ouvinte mora aqui, e não em quem chama, porque a alternativa é depender de
 * cada ponto de criação lembrar de registrá-lo — e o esquecimento não falha
 * em teste, falha em produção no dia em que o banco reiniciar.
 */
export function createDatabase(
  databaseUrl: string,
  options: CreateDatabaseOptions = {},
): { db: Database; pool: Pool } {
  const pool = new Pool({
    connectionString: databaseUrl,
    /*
     * O tempo limite é aplicado na conexão, e não por consulta, porque a
     * proteção precisa valer inclusive para as consultas que ninguém previu —
     * inclusive as que uma versão futura do Drizzle venha a emitir.
     */
    ...(options.statementTimeoutMs === undefined
      ? {}
      : { statement_timeout: options.statementTimeoutMs }),
  })

  pool.on('error', (error) => {
    if (options.onPoolError) {
      options.onPoolError(error)

      return
    }

    // Sem destino configurado a mensagem vai para a saída de erro: engolir em
    // silêncio trocaria uma queda barulhenta por uma falha invisível.
    process.stderr.write(`[pool] conexão ociosa perdida: ${error.message}\n`)
  })

  const db = drizzle(pool, { schema })

  return { db, pool }
}
