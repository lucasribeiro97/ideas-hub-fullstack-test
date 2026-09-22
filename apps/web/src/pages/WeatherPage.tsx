import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client.ts'
import { ErrorState } from '../components/ErrorState.tsx'
import { PageHeading } from '../components/PageHeading.tsx'
import { WeatherSummary } from '../components/WeatherSummary.tsx'
import { useWeather } from '../hooks/useWeather.ts'

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })

export function WeatherPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const city = searchParams.get('city')?.trim() ?? ''
  const [inputValue, setInputValue] = useState(city)

  const { data, isFetching, isError, error, refetch } = useWeather(city)

  /*
   * Busca por envio explícito, e não com debounce como na listagem de
   * usuários. A diferença é proposital: aqui cada consulta atravessa para um
   * serviço externo com cota, e disparar a cada pausa na digitação gastaria
   * requisições em nomes incompletos que ninguém pediu.
   */
  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    const trimmed = inputValue.trim()

    setSearchParams(trimmed.length > 0 ? { city: trimmed } : {}, { replace: true })
  }

  const isCityNotFound = error instanceof ApiError && error.code === 'WEATHER_CITY_NOT_FOUND'

  return (
    <>
      <PageHeading
        title="Clima"
        description="Consulte a condição atual e a variação de temperatura do dia."
      />

      <form className="filters" role="search" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="cidade">Cidade</label>
          <input
            id="cidade"
            type="search"
            value={inputValue}
            placeholder="ex.: São Paulo"
            autoComplete="address-level2"
            onChange={(event) => {
              setInputValue(event.target.value)
            }}
          />
        </div>
        <div className="field field--compact">
          <button type="submit" className="button button--primary" disabled={isFetching}>
            {isFetching ? 'Consultando…' : 'Consultar'}
          </button>
        </div>
      </form>

      <div aria-busy={isFetching} aria-live="polite" className="list-status">
        {isFetching && 'Consultando o serviço de clima…'}
      </div>

      {city.length === 0 && (
        <p className="text-muted">Informe uma cidade para ver a previsão do dia.</p>
      )}

      {/*
        Cidade inexistente não é falha do serviço: a mensagem orienta a revisar
        o nome, e não oferece repetir — insistir devolveria o mesmo 404.
      */}
      {isCityNotFound && (
        <div className="state" role="alert">
          <h2 className="state__title">Cidade não encontrada</h2>
          <p className="state__description">
            Não encontramos “{city}”. Verifique a grafia ou tente incluir o estado, como
            “Campinas, SP”.
          </p>
        </div>
      )}

      {isError && !isCityNotFound && (
        <ErrorState
          error={error}
          onRetry={() => {
            void refetch()
          }}
        />
      )}

      {data !== undefined && (
        <>
          {/*
            O dado servido de cache expirado é sinalizado em vez de passar por
            atual: a política stale-if-error da API devolve 200 com a última
            leitura conhecida quando a origem está fora do ar, e quem consulta
            precisa saber que a temperatura não é de agora.
          */}
          {data.cache.stale && (
            <p className="notice" role="status">
              O serviço de clima está indisponível no momento. Mostrando a última leitura
              disponível, de {dateTimeFormatter.format(new Date(data.cache.fetchedAt))}.
            </p>
          )}

          <WeatherSummary weather={data} />
        </>
      )}
    </>
  )
}
