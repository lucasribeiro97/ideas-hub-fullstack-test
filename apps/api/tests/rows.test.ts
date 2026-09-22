import { describe, expect, it } from 'vitest'
import { firstOrThrow } from '../src/lib/rows.js'

describe('firstOrThrow', () => {
  it('devolve a primeira linha quando existe', () => {
    expect(firstOrThrow([{ id: 1 }, { id: 2 }], 'não deveria falhar')).toEqual({ id: 1 })
  })

  it('lança com a mensagem informada quando o retorno vem vazio', () => {
    expect(() => firstOrThrow([], 'insert não retornou linha')).toThrow('insert não retornou linha')
  })

  it('não confunde valor falsy com ausência de linha', () => {
    expect(firstOrThrow([0], 'não deveria falhar')).toBe(0)
    expect(firstOrThrow([null], 'não deveria falhar')).toBeNull()
  })
})
