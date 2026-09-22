import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { commonErrorResponses } from '../../lib/error-schemas.js'
import { errorResponseSchema } from '../../lib/error-schemas.js'
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
          response: {
            200: weatherResponseSchema,
            404: errorResponseSchema.meta({ description: 'Cidade não encontrada na origem.' }),
            429: errorResponseSchema.meta({ description: 'Cota da origem esgotada.' }),
            502: errorResponseSchema.meta({ description: 'Origem indisponível ou resposta inesperada.' }),
            504: errorResponseSchema.meta({ description: 'Origem excedeu o tempo limite.' }),
            ...commonErrorResponses,
          },
        },
      },
      async (request) => getWeather(deps, request.params.city),
    )
  }
}
