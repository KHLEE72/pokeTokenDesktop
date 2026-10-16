import { describe, expect, it } from 'vitest'
import { POKEMON, newGame } from '../src/shared/model'
import { FAMILIES, POKEMON_BY_ID } from '../src/shared/catalog'
import { speciesRarity, MAJOR_LEGENDARIES } from '../src/shared/rarity'
import { unlockRewards, RewardState, rarityDiscoveries, themeUnlocked } from '../src/shared/rewards'
import { hatchFamilyWeight } from '../src/shared/game'

describe('legendary display categories and collection rewards',()=>{
  it('separates major legends, other legendary species and mythical species without mislabeling powerful ordinary Pokémon',()=>{
    const counts={ordinary:0,sublegendary:0,legendary:0,mythical:0}
    for(const p of POKEMON)counts[speciesRarity(p.id)]++
    for(const family of FAMILIES){const root=POKEMON_BY_ID.get(family.species[0])!;expect(hatchFamilyWeight(family.family)).toBe(root.mythical?3:root.legendary?10:100)}
    expect(counts).toEqual({ordinary:931,sublegendary:44,legendary:27,mythical:23})
    expect(new Set(MAJOR_LEGENDARIES).size).toBe(27)
    for(const id of [144,145,146,243,244,245,772,773,891,892,1017])expect(speciesRarity(id)).toBe('sublegendary')
    for(const id of [150,249,716,789,790,888,1007,1008,1024])expect(speciesRarity(id)).toBe('legendary')
    for(const id of [151,251,385,493,801,1025])expect(speciesRarity(id)).toBe('mythical')
    for(const id of [149,248,445,635,793,985,1006])expect(speciesRarity(id)).toBe('ordinary')
  })
  it('counts distinct normal/shiny species and permanently grants the corresponding ball and theme',()=>{
    const game=newGame(),rewards:RewardState={unlocked:{master:'old'}}
    game.owned=[144,145];game.ownedShiny=[144,145]
    unlockRewards(game,rewards,'two');expect(rewards.unlocked.timer).toBeUndefined()
    expect(rarityDiscoveries(game,'sublegendary')).toBe(2)
    game.ownedShiny.push(146);unlockRewards(game,rewards,'three');expect(rewards.unlocked.timer).toBe('three')
    game.owned.push(150,151);unlockRewards(game,rewards,'encounter')
    expect(rewards.unlocked.dream).toBe('encounter');expect(rewards.unlocked.cherish).toBe('encounter')
    expect(rewards.unlocked.master).toBe('old')
    game.owned=[];game.ownedShiny=[];expect(unlockRewards(game,rewards,'later')).toEqual([])
    for(const id of ['timer','dream','cherish'] as const)expect(themeUnlocked(rewards,id)).toBe(true)
    expect(themeUnlocked({unlocked:{}},'dream')).toBe(false)
  })
})
