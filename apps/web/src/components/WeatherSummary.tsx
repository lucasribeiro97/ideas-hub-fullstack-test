import type { Weather } from '../api/types.ts'

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })
const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function formatTemperature(celsius: number): string {
  return `${numberFormatter.format(celsius)} °C`
}

/**
 * A observação vem da origem como "2026-09-22 12:45", sem fuso. Interpretada
 * direto por `new Date`, viraria data inválida em alguns navegadores.
 */
function formatObservedAt(value: string): string {
  const normalized = value.replace(' ', 'T')
  const parsed = new Date(normalized)

  return Number.isNaN(parsed.getTime()) ? value : timeFormatter.format(parsed)
}

interface WeatherSummaryProps {
  weather: Weather
}

export function WeatherSummary({ weather }: WeatherSummaryProps) {
  return (
    <section className="weather" aria-labelledby="clima-local">
      {/*
        Premissa P7: a WeatherAPI faz correspondência aproximada de nome. Um
        erro de digitação raramente produz 404 — mais frequentemente devolve
        outra cidade. Exibir a localidade resolvida em destaque é o único meio
        de quem consultou perceber que recebeu o lugar errado.
      */}
      <h2 className="weather__location" id="clima-local">
        {weather.city}
        <span className="weather__region">
          {weather.region.length > 0 ? `${weather.region} · ` : ''}
          {weather.country}
        </span>
      </h2>

      <div className="weather__current">
        <p className="weather__temperature">
          {formatTemperature(weather.current.temperatureC)}
        </p>
        <p className="weather__condition">{weather.current.condition}</p>
      </div>

      <dl className="weather__details">
        <div>
          <dt>Sensação térmica</dt>
          <dd>{formatTemperature(weather.current.feelsLikeC)}</dd>
        </div>
        <div>
          <dt>Umidade</dt>
          <dd>{weather.current.humidity}%</dd>
        </div>
        <div>
          <dt>Observado às</dt>
          <dd>{formatObservedAt(weather.current.observedAt)}</dd>
        </div>
      </dl>
    </section>
  )
}
