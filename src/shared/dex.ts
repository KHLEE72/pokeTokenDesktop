import type { GameState } from './model'
import { Language, localeFor, pokemonName } from './i18n'
import { nationalId } from './catalog'
import { appearanceCollection } from './mega'

export type DexSort = 'number' | 'name' | 'acquired'
export const isDexSort = (value: unknown): value is DexSort => value === 'number' || value === 'name' || value === 'acquired'

export function sortDex<T extends { id: number }>(items: readonly T[], sort: DexSort, game: GameState, shiny: boolean, language: Language): T[] {
  const order = new Map<number, number>()
  // Registration arrays retain first discovery order, including on older saves.
  for (const id of shiny ? [...game.ownedShiny,...appearanceCollection(game).ownedShiny] : [...game.owned,...appearanceCollection(game).owned]) if (!order.has(id)) order.set(id, order.size)
  const collator = new Intl.Collator(localeFor(language), { sensitivity: 'base', numeric: true })
  return [...items].sort((a, b) => {
    if (sort === 'name') return collator.compare(pokemonName(a.id, language), pokemonName(b.id, language)) || a.id - b.id
    if (sort === 'acquired') return (order.get(b.id) ?? -1) - (order.get(a.id) ?? -1) || a.id - b.id
    return nationalId(a.id)-nationalId(b.id)||a.id-b.id
  })
}
