import { describe, expect, it } from 'vitest'
import { EGG_TYPES, EVOLUTIONS, FAMILIES, POKEMON, POKEMON_BY_ID } from '../src/shared/catalog'
import { activePet, advanceGame, chooseHatchFamily, eggFamilies, gameAction, growthPath, hatchFamilyWeight, isGrowing, speciesId, threshold } from '../src/shared/game'
import { newGame } from '../src/shared/model'
import source from '../src/shared/catalog-data.json'
import { pokemonName } from '../src/shared/i18n'
import { hatchRandom } from './hatch-random'

const now='2026-10-16T00:00:00Z'
describe('complete default-form National Pokédex',()=>{
  it('covers generations 1–9 once with official names in all three languages',()=>{
    expect(POKEMON.map(p=>p.id)).toEqual(Array.from({length:1025},(_,i)=>i+1))
    expect(Array.from({length:9},(_,i)=>POKEMON.filter(p=>p.generation===i+1).length)).toEqual([151,100,135,107,156,72,88,96,120])
    for(const p of POKEMON){
      expect(p.types.length).toBeGreaterThan(0)
      expect(p.types.every(t=>EGG_TYPES.some(egg=>egg.id===t))).toBe(true)
      for(const language of ['ko','en','ja'] as const)expect(pokemonName(p.id,language)).not.toBe('Pokémon')
    }
  })
  it('keeps every old family number and its saved species stages stable',()=>{
    const old=[[1,2,3],[4,5,6],[7,8,9],[19,20],[172,25,26],[363,364,365],[66,67,68],[29,30,31],[27,28],[16,17,18],[63,64,65],[10,11,12],[74,75,76],[92,93,94],[147,148,149],[633,634,635],[304,305,306],[173,35,36],[133,134,135,136,196,197,470,471,700]]
    old.forEach((ids,family)=>{
      expect(FAMILIES[family].species).toEqual(ids)
      ids.forEach((id,index)=>{expect(POKEMON_BY_ID.get(id)?.family).toBe(family);expect(POKEMON_BY_ID.get(id)?.phase).toBe(family===18&&index>0?2:index+1)})
    })
  })
  it('can reach every species by valid token growth, target selection, and shiny-preserving collection',()=>{
    const reached=new Set<number>()
    function walk(id:number,path:number[]){
      expect(path).not.toContain(id);reached.add(id)
      const p=POKEMON_BY_ID.get(id)!,game=newGame()
      Object.assign(activePet(game),{family:p.family,phase:p.phase,xp:0,shiny:true,path:[...path,id]})
      game.displayPhase=p.phase;game.ownedShiny=[...path,id]
      for(const next of EVOLUTIONS[id]){
        const copy=structuredClone(game)
        if(EVOLUTIONS[id].length>1)gameAction(copy,{type:'target',speciesId:next},'fast',now)
        advanceGame(copy,threshold(p.phase,'fast'),'fast',now)
        expect(speciesId(copy)).toBe(next);expect(activePet(copy).shiny).toBe(true)
        expect(growthPath(activePet(copy))).toEqual([...path,id,next])
        if(!EVOLUTIONS[next].length){expect(isGrowing(copy)).toBe(false);expect(copy.captures[0].speciesId).toBe(next)}
        walk(next,[...path,id])
      }
    }
    for(const family of FAMILIES){expect(family.eggTypes.length).toBeGreaterThan(0);walk(family.species[0],[])}
    expect(reached.size).toBe(1025)
  })
  it('does not turn ordinary forms into regional-only evolutions and can hatch those species independently',()=>{
    expect(source.source.independentSpecies).toEqual([862,863,864,865,866,867,902,903,904,980])
    for(const id of source.source.independentSpecies){
      const p=POKEMON_BY_ID.get(id)!,game=newGame()
      gameAction(game,{type:'egg',eggType:FAMILIES[p.family].eggTypes[0]},'fast',now)
      advanceGame(game,500_123,'fast',now,hatchRandom(p.family))
      expect(speciesId(game)).toBe(id);expect(isGrowing(game)).toBe(false)
      expect(game.candyTokens).toBe(123);expect(game.captures[0].speciesId).toBe(id)
    }
    expect(EVOLUTIONS[665]).toEqual([666]);expect(EVOLUTIONS[281]).toEqual([282,475])
    expect(EVOLUTIONS[935]).toEqual([936,937]);expect(EVOLUTIONS[840]).toEqual([841,842,1011])
    expect(EVOLUTIONS[215]).toEqual([461]);expect(EVOLUTIONS[264]).toEqual([])
  })
  it('weights legendary and mythical families lower while allowing every egg candidate to hatch',()=>{
    for(const family of FAMILIES){
      const p=POKEMON_BY_ID.get(family.species[0])!
      expect(hatchFamilyWeight(family.family)).toBe(p.mythical?3:p.legendary?10:100)
      expect(chooseHatchFamily(eggFamilies(family.eggTypes[0]),hatchRandom(family.family))).toBe(family.family)
    }
    expect(()=>chooseHatchFamily([])).toThrow()
    expect(chooseHatchFamily([0],()=>{throw Error('unnecessary roll')})).toBe(0)
  })
})
