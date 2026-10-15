import { describe, expect, it } from 'vitest'
import { newGame } from '../src/shared/model'
import { sortDex } from '../src/shared/dex'
import { localeFor, pokemonName } from '../src/shared/i18n'

describe('Pokédex sorting', () => {
  const items = [{ id: 172 }, { id: 1 }, { id: 25 }, { id: 133 }, { id: 4 }]
  const ids = (items: { id: number }[]): number[] => items.map(p => p.id)
  it('sorts by National Pokédex number without modifying the roster', () => {
    expect(ids(sortDex(items, 'number', newGame(), false, 'en'))).toEqual([1, 4, 25, 133, 172])
    expect(ids(items)).toEqual([172, 1, 25, 133, 4])
  })
  it('compares official names using the selected language collation', () => {
    for (const language of ['ko', 'en', 'ja'] as const) {
      const sorted = sortDex(items, 'name', newGame(), false, language)
      const names = sorted.map(p => pokemonName(p.id, language))
      expect(names).toEqual([...names].sort(new Intl.Collator(localeFor(language), { sensitivity: 'base', numeric: true }).compare))
    }
    expect(ids(sortDex(items, 'name', newGame(), false, 'en'))).toEqual([1, 4, 133, 172, 25])
  })
  it('puts recent first discoveries first, separates shiny discovery and leaves undiscovered species last', () => {
    const game = newGame(); game.owned = [133, 25, 1, 25]; game.ownedShiny = [1, 172]
    expect(ids(sortDex(items, 'acquired', game, false, 'en'))).toEqual([1, 25, 133, 4, 172])
    expect(ids(sortDex(items, 'acquired', game, true, 'en'))).toEqual([172, 1, 4, 25, 133])
    expect(game.owned).toEqual([133, 25, 1, 25])
    expect(ids(sortDex(items, 'acquired', newGame(), false, 'en'))).toEqual([1, 4, 25, 133, 172])
  })
})
