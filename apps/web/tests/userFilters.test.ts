import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILTERS,
  applyFilterChange,
  parseFilters,
  toSearchParams,
  toggleSort,
  type UsersFilters,
} from '../src/lib/userFilters'

function parse(query: string): UsersFilters {
  return parseFilters(new URLSearchParams(query))
}

describe('parseFilters — padrões', () => {
  it('URL sem parâmetros usa os padrões da API', () => {
    expect(parse('')).toEqual(DEFAULT_FILTERS)
  })

  it('lê todos os parâmetros informados', () => {
    expect(parse('search=souza&page=3&perPage=50&sort=name&order=asc')).toEqual({
      search: 'souza',
      page: 3,
      perPage: 50,
      sort: 'name',
      order: 'asc',
    })
  })

  it('remove espaços em volta da busca', () => {
    expect(parse('search=%20%20souza%20%20').search).toBe('souza')
  })
})

/*
 * A URL é editável por quem usa. Um valor inválido não pode virar requisição
 * malformada nem tela de erro: o pior caso é ver a primeira página.
 */
describe('parseFilters — valores inválidos caem no padrão', () => {
  it.each([
    ['página não numérica', 'page=abc', 'page', 1],
    ['página zero', 'page=0', 'page', 1],
    ['página negativa', 'page=-5', 'page', 1],
    ['página fracionária', 'page=1.5', 'page', 1],
  ])('%s', (_case, query, key, expected) => {
    expect(parse(query)[key as 'page']).toBe(expected)
  })

  it('campo de ordenação desconhecido cai no padrão', () => {
    expect(parse('sort=senha').sort).toBe('createdAt')
  })

  it('direção de ordenação inválida cai no padrão', () => {
    expect(parse('order=aleatorio').order).toBe('desc')
  })

  // A API aceita qualquer perPage até 100, mas um valor como 37 deixaria o
  // seletor da tela sem opção correspondente selecionada.
  it('itens por página fora das opções oferecidas cai no padrão', () => {
    expect(parse('perPage=37').perPage).toBe(20)
    expect(parse('perPage=200').perPage).toBe(20)
  })

  it('aceita as opções oferecidas', () => {
    expect(parse('perPage=100').perPage).toBe(100)
  })
})

/*
 * URL limpa é compartilhável e legível. `/users?search=souza` diz o que faz;
 * com todos os padrões explícitos, a informação útil some no ruído.
 */
describe('toSearchParams — omite os padrões', () => {
  it('filtros padrão não produzem query alguma', () => {
    expect(toSearchParams(DEFAULT_FILTERS).toString()).toBe('')
  })

  it('inclui apenas o que difere do padrão', () => {
    const query = toSearchParams({ ...DEFAULT_FILTERS, search: 'souza' }).toString()

    expect(query).toBe('search=souza')
  })

  it('a ida e volta pela URL preserva os filtros', () => {
    const original: UsersFilters = {
      search: 'ana',
      page: 7,
      perPage: 50,
      sort: 'email',
      order: 'asc',
    }

    expect(parseFilters(toSearchParams(original))).toEqual(original)
  })
})

/*
 * Sem o retorno à primeira página, quem está na página 47 e digita uma busca
 * com 3 páginas de resultado vê lista vazia e conclui que nada foi encontrado.
 */
describe('applyFilterChange — retorno à primeira página', () => {
  const naPagina47: UsersFilters = { ...DEFAULT_FILTERS, page: 47 }

  it.each([
    ['busca', { search: 'souza' }],
    ['itens por página', { perPage: 50 }],
    ['campo de ordenação', { sort: 'name' as const }],
    ['direção de ordenação', { order: 'asc' as const }],
  ])('mudar %s volta para a página 1', (_case, change) => {
    expect(applyFilterChange(naPagina47, change).page).toBe(1)
  })

  it('mudar a página não a reseta', () => {
    expect(applyFilterChange(naPagina47, { page: 48 }).page).toBe(48)
  })

  it('reenviar o mesmo valor não reseta a página', () => {
    const comBusca: UsersFilters = { ...naPagina47, search: 'souza' }

    expect(applyFilterChange(comBusca, { search: 'souza' }).page).toBe(47)
  })

  it('preserva os demais filtros', () => {
    const resultado = applyFilterChange({ ...naPagina47, perPage: 50 }, { search: 'ana' })

    expect(resultado.perPage).toBe(50)
    expect(resultado.search).toBe('ana')
  })
})

describe('toggleSort', () => {
  it('coluna nova ordena de forma crescente', () => {
    const resultado = toggleSort(DEFAULT_FILTERS, 'name')

    expect(resultado).toMatchObject({ sort: 'name', order: 'asc' })
  })

  it('clicar de novo na mesma coluna inverte o sentido', () => {
    const crescente = toggleSort(DEFAULT_FILTERS, 'name')
    const decrescente = toggleSort(crescente, 'name')

    expect(decrescente.order).toBe('desc')
    expect(toggleSort(decrescente, 'name').order).toBe('asc')
  })

  it('trocar de coluna recomeça em crescente', () => {
    const porNomeDecrescente = toggleSort(toggleSort(DEFAULT_FILTERS, 'name'), 'name')

    expect(toggleSort(porNomeDecrescente, 'email')).toMatchObject({
      sort: 'email',
      order: 'asc',
    })
  })

  it('ordenar volta para a primeira página', () => {
    expect(toggleSort({ ...DEFAULT_FILTERS, page: 9 }, 'name').page).toBe(1)
  })
})
