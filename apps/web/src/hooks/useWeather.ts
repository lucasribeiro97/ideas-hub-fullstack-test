import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getWeather } from '../api/weather.ts'
import type { Weather } from '../api/types.ts'

/**
 * Consulta o clima de uma cidade.
 *
 * `enabled` deixa a consulta parada enquanto não houver cidade: sem isso, abrir
 * a tela dispararia uma requisição com nome vazio, que a API recusaria com 400.
 *
 * Sem `retry`: a API já distingue cidade inexistente de indisponibilidade, e
 * repetir um 404 só atrasa a mensagem que a pessoa precisa ler.
 */
export function useWeather(city: string): UseQueryResult<Weather> {
  return useQuery({
    queryKey: ['weather', city],
    queryFn: ({ signal }) => getWeather(city, { signal }),
    enabled: city.length > 0,
    retry: false,
    // A API já mantém cache próprio com expiração; um segundo cache longo aqui
    // esconderia a atualização do servidor sem ganho.
    staleTime: 60_000,
  })
}
