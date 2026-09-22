import { z } from 'zod'
import { firstOrThrow } from '../../lib/rows.js'

/*
 * Contrato próprio de clima (SPEC §6).
 *
 * Deliberadamente diferente da forma da WeatherAPI: `temp_c` vira
 * `temperatureC`, `forecast.forecastday[0].hour` vira `hourly`. Repassar a
 * resposta externa acoplaria o frontend a um serviço de terceiros — trocar de
 * provedor exigiria mexer na interface, e qualquer mudança na API deles
 * quebraria a nossa sem aviso.
 */

export const hourlyTemperatureSchema = z.object({
  time: z.string(),
  temperatureC: z.number(),
})

export const weatherSnapshotSchema = z.object({
  city: z.string(),
  region: z.string(),
  country: z.string(),
  current: z.object({
    temperatureC: z.number(),
    feelsLikeC: z.number(),
    humidity: z.number(),
    condition: z.string(),
    observedAt: z.string(),
  }),
  hourly: z.array(hourlyTemperatureSchema),
})

/** O que o cliente HTTP devolve, antes de o cache anexar seus metadados. */
export type WeatherSnapshot = z.infer<typeof weatherSnapshotSchema>

export const weatherResponseSchema = weatherSnapshotSchema.extend({
  cache: z.object({
    hit: z.boolean(),
    stale: z.boolean(),
    fetchedAt: z.string(),
  }),
})

export type WeatherResponse = z.infer<typeof weatherResponseSchema>

export const weatherParamsSchema = z.object({
  city: z
    .string()
    .trim()
    .min(1, 'informe o nome da cidade')
    .max(120, 'nome da cidade muito longo'),
})

/*
 * Forma da resposta da WeatherAPI, validada antes da tradução.
 *
 * Só os campos que realmente usamos são exigidos: validar o payload inteiro
 * faria a integração quebrar sempre que eles acrescentassem algo. Se estes
 * campos mudarem, queremos falhar de forma clara em vez de produzir `NaN`
 * silencioso na interface.
 */
export const weatherApiResponseSchema = z.object({
  location: z.object({
    name: z.string(),
    region: z.string().default(''),
    country: z.string(),
  }),
  current: z.object({
    temp_c: z.number(),
    feelslike_c: z.number(),
    humidity: z.number(),
    condition: z.object({ text: z.string() }),
    last_updated: z.string(),
  }),
  forecast: z.object({
    forecastday: z
      .array(
        z.object({
          hour: z.array(z.object({ time: z.string(), temp_c: z.number() })),
        }),
      )
      .min(1, 'previsão sem nenhum dia'),
  }),
})

/** Traduz a resposta da origem para o contrato próprio. */
export function toWeatherSnapshot(
  raw: z.infer<typeof weatherApiResponseSchema>,
): WeatherSnapshot {
  return {
    city: raw.location.name,
    region: raw.location.region,
    country: raw.location.country,
    current: {
      temperatureC: raw.current.temp_c,
      feelsLikeC: raw.current.feelslike_c,
      humidity: raw.current.humidity,
      condition: raw.current.condition.text,
      observedAt: raw.current.last_updated,
    },
    // `forecastday` tem `min(1)` no schema, então a ausência aqui seria
    // defeito interno e não previsão vazia.
    hourly: firstOrThrow(raw.forecast.forecastday, 'previsão sem dias').hour.map((hour) => ({
      time: hour.time,
      temperatureC: hour.temp_c,
    })),
  }
}
