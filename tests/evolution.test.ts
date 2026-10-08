import { describe, expect, it } from 'vitest'
import { activePet, advanceGame, candyCount, changePace, dexChoices, evolutionOptions, finalPhase, gameAction, growthPath, isGrowing, speciesId, threshold, upgradeGrowthPaths, waitingForEvolution } from '../src/shared/game'
import { EVOLUTIONS, FAMILIES, newGame, POKEMON } from '../src/shared/model'
const now='2026-10-08T00:00:00Z',leaves=[134,135,136,196,197,470,471,700]
const eevee=(shiny=false)=>{
  const game=newGame();gameAction(game,{type:'egg',eggType:'normal'},'fast',now)
  let calls=0
  advanceGame(game,500_000,'fast',now,()=>calls++===0 ? .999 : shiny ? 0 : .5)
  expect(speciesId(game)).toBe(133)
  return game
}
describe('branching evolution',()=>{
  it.each(leaves)('automatically evolves only through the selected %s branch and preserves shiny identity',id=>{
    const game=eevee(true),pet=activePet(game)
    expect(finalPhase(pet)).toBe(2);expect(evolutionOptions(pet)).toEqual(leaves)
    gameAction(game,{type:'target',speciesId:id},'fast',now)
    advanceGame(game,50_000_123,'fast',now)
    expect(speciesId(game)).toBe(id);expect(growthPath(pet)).toEqual([133,id])
    expect(pet.shiny).toBe(true);expect(pet.evolutionTarget).toBeNull()
    expect(game.ownedShiny).toEqual([133,id]);expect(game.owned).toEqual([])
    expect(game.candyTokens).toBe(123);expect(game.captures[0].speciesId).toBe(id)
    for(const leaf of leaves)expect(dexChoices(game,leaf,true)).toHaveLength(leaf===id ? 1 : 0)
  })
  it('stops at 100% without a target, banks overflow and subsequent tokens, and resolves without spending XP twice',()=>{
    const game=eevee(),pet=activePet(game)
    advanceGame(game,50_100_001,'fast',now)
    expect(speciesId(game)).toBe(133);expect(pet.xp).toBe(50_000_000)
    expect(waitingForEvolution(pet,'fast')).toBe(true);expect(game.captures).toEqual([])
    advanceGame(game,99_999,'fast',now)
    expect(game.candyTokens).toBe(200_000);expect(pet.xp).toBe(50_000_000)
    const earned=game.tokensEarned
    gameAction(game,{type:'target',speciesId:197},'fast',now)
    expect(speciesId(game)).toBe(197);expect(game.candyTokens).toBe(200_000)
    expect(game.tokensEarned).toBe(earned);expect(game.captures).toHaveLength(1)
    advanceGame(game,1,'fast',now);expect(game.captures).toHaveLength(1)
  })
  it('can change or clear the goal before evolution without changing progress or unlocking leaves',()=>{
    const game=eevee();advanceGame(game,25_000_000,'fast',now)
    for(const id of [134,700,null]) gameAction(game,{type:'target',speciesId:id},'fast',now)
    expect(activePet(game).xp).toBe(25_000_000);expect(game.owned).toEqual([133])
    expect(activePet(game).evolutionTarget).toBeNull()
    advanceGame(game,25_000_000,'fast',now);expect(speciesId(game)).toBe(133)
  })
  it('limits candy spending at an unresolved branch and does not consume candy while waiting',()=>{
    const game=eevee();advanceGame(game,49_999_999,'fast',now);game.candyTokens=500_000
    const earned=game.tokensEarned
    gameAction(game,{type:'candy',count:5},'fast',now)
    expect(activePet(game).xp).toBe(50_000_000);expect(game.candyTokens).toBe(499_999)
    const before=structuredClone(game)
    expect(()=>gameAction(game,{type:'candy',count:1},'fast',now)).toThrow('목표')
    expect(game).toEqual(before)
    gameAction(game,{type:'target',speciesId:134},'fast',now)
    expect(speciesId(game)).toBe(134);expect(game.tokensEarned).toBe(earned)
    expect(game.candyTokens).toBe(499_999)
  })
  it('allows candy to finish a chosen branch and preserves unused value',()=>{
    const game=eevee();advanceGame(game,49_950_000,'fast',now);game.candyTokens=300_000
    gameAction(game,{type:'target',speciesId:470},'fast',now)
    gameAction(game,{type:'candy',count:3},'fast',now)
    expect(speciesId(game)).toBe(470);expect(game.candyTokens).toBe(250_000)
  })
  it('keeps a completed earlier Eevee appearance complete, forbids switching its branch, and grows a separate new Eevee',()=>{
    const game=eevee(),first=game.activeId
    gameAction(game,{type:'target',speciesId:700},'fast',now);advanceGame(game,50_000_000,'fast',now)
    gameAction(game,{type:'select',petId:first,phase:1},'fast',now)
    expect(speciesId(game)).toBe(133);expect(isGrowing(game)).toBe(false)
    const before=structuredClone(game)
    expect(()=>gameAction(game,{type:'target',speciesId:197},'fast',now)).toThrow()
    expect(game).toEqual(before);advanceGame(game,100_000,'fast',now)
    gameAction(game,{type:'egg',eggType:'normal'},'fast',now)
    advanceGame(game,500_000,'fast',now,()=>.999)
    expect(game.activeId).not.toBe(first)
    gameAction(game,{type:'target',speciesId:197},'fast',now);advanceGame(game,50_000_000,'fast',now)
    expect(game.owned).toEqual([133,700,197]);expect(dexChoices(game,133,false)).toHaveLength(2)
    expect(dexChoices(game,700,false)[0].id).toBe(first);expect(candyCount(game)).toBe(1)
  })
  it('preserves 100% waiting progress on pace changes and keeps incomplete progress below the boundary',()=>{
    const game=eevee();advanceGame(game,50_000_000,'fast',now)
    for(const [before,after] of [['fast','slow'],['slow','normal'],['normal','fast']] as const) {
      changePace(game,before,after)
      expect(waitingForEvolution(activePet(game),after)).toBe(true)
      expect(activePet(game).xp).toBe(threshold(1,after));expect(speciesId(game)).toBe(133)
    }
    gameAction(game,{type:'target',speciesId:471},'fast',now);expect(speciesId(game)).toBe(471)
    const second=eevee();advanceGame(second,49_999_999,'fast',now)
    changePace(second,'fast','slow');expect(activePet(second).xp).toBeLessThan(threshold(1,'slow'))
  })
  it('rejects impossible goals on eggs, linear families and Eevee without changing the game',()=>{
    for(const game of [newGame(),eevee()]) {
      const before=structuredClone(game)
      for(const id of [1,133,-1,NaN,1.5])expect(()=>gameAction(game,{type:'target',speciesId:id},'fast',now)).toThrow()
      expect(game).toEqual(before)
    }
    const linear=newGame();advanceGame(linear,500_000,'fast',now)
    expect(()=>gameAction(linear,{type:'target',speciesId:2},'fast',now)).toThrow()
  })
  it('backfills actual linear paths and capture species without changing XP, candy or owned species',()=>{
    const game=newGame();advanceGame(game,150_600_000,'fast',now)
    const pet=activePet(game);delete pet.path;delete pet.evolutionTarget;delete game.captures[0].speciesId
    const before=structuredClone(game)
    upgradeGrowthPaths(game)
    expect(pet.path).toEqual([1,2,3]);expect(game.captures[0].speciesId).toBe(3)
    expect(game.tokensEarned).toBe(before.tokensEarned);expect(game.candyTokens).toBe(before.candyTokens)
    expect(game.owned).toEqual(before.owned)
    const once=structuredClone(game);upgradeGrowthPaths(game);expect(game).toEqual(once)
  })
  it('has an acyclic graph covering the full catalog with only valid family and stage transitions',()=>{
    const visited=new Set<number>()
    const walk=(id:number,path:number[])=>{
      expect(path).not.toContain(id);visited.add(id)
      const parent=POKEMON.find(p=>p.id===id)!
      for(const childId of EVOLUTIONS[id]) {
        const child=POKEMON.find(p=>p.id===childId)!
        expect(child.family).toBe(parent.family);expect(child.phase).toBe(parent.phase+1)
        walk(childId,[...path,id])
      }
    }
    for(const family of FAMILIES)walk(family.species[0],[])
    expect(visited.size).toBe(POKEMON.length)
  })
})
