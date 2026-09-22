import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { getWeather, type WeatherServiceDependencies } from './weather.service.js'
import { weatherParamsSchema, weatherResponseSchema } from './weather.schemas.js'

/**
 * Rota de clima.
 *
 * A chave da API vive apenas em `deps.client` e nunca é exposta: o navegador
 * chama esta rota, e só o servidor conhece a origem externa (critério S8).
 */
export function weatherRoutes(deps: WeatherServiceDependencies): FastifyPluginAsync {
  return async function register(app: FastifyInstance): Promise<void> {
    const route = app.withTypeProvider<ZodTypeProvider>()

    route.get(
      '/weather/:city',
      {
        schema: {
          tags: ['weather'],
          summary: 'Consulta o clima de uma cidade',
          params: weatherParamsSchema,
          response: { 200: weatherResponseSchema },
        },
      },
      async (request) => getWeather(deps, request.params.city),
    )
  }
}
