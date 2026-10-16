import { nationalId, POKEMON_BY_ID } from './catalog'

export type Rarity = 'ordinary' | 'sublegendary' | 'legendary' | 'mythical'
// Display categories, not current battle legality. "Sub-Legendary" is a fan
// term: major/restricted legendary lineages are separated from other legends.
export const MAJOR_LEGENDARIES = [150,249,250,382,383,384,483,484,487,643,644,646,716,717,718,789,790,791,792,800,888,889,890,898,1007,1008,1024] as const
const major = new Set<number>(MAJOR_LEGENDARIES)
export const RARITIES: {id:Rarity;name:string}[] = [
  {id:'ordinary',name:'일반 포켓몬'},{id:'sublegendary',name:'준전설'},{id:'legendary',name:'전설'},{id:'mythical',name:'환상'}
]
export function speciesRarity(id:number):Rarity {
  const p=POKEMON_BY_ID.get(id)
  return p?.mythical?'mythical':p?.legendary?(major.has(nationalId(id))?'legendary':'sublegendary'):'ordinary'
}
export const rarityName=(rarity:Rarity):string=>RARITIES.find(r=>r.id===rarity)!.name
