import type { FastifyInstance } from 'fastify'

/**
 * Sonda de disponibilidade do processo.
 *
 * Deliberadamente não consulta o banco: serve para confirmar que o servidor
 * subiu e responde. A prontidão do banco é verificada pelo healthcheck do
 * docker compose, que é quem precisa dessa informação.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    { schema: { tags: ['health'], summary: 'Verifica se o servidor está no ar' } },
    async () => ({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) }),
  )
}
