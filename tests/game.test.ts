import { describe, expect, it } from 'vitest'
import { activePet, advanceGame, candyCount, CANDY_XP, changePace, dexChoices, eggFamilies, gameAction, isGrowing, migrateGame, speciesId, threshold } from '../src/shared/game'
import { EGG_TYPES, FAMILIES, newGame, POKEMON } from '../src/shared/model'
const now='2026-10-07T00:00:00Z',normal=()=>.5
describe('growth, candy and collection',()=>{
  it('hatches at the exact boundary and preserves overflow',()=>{
    const game=newGame();advanceGame(game,499_999,'fast',now,normal)
    expect(activePet(game).phase).toBe(0)
    advanceGame(game,2,'fast',now,normal)
    expect(speciesId(game)).toBe(1);expect(activePet(game).xp).toBe(1);expect(game.owned).toEqual([1])
  })
  it('stops at final evolution and banks all overflow and subsequent usage',()=>{
    const game=newGame();advanceGame(game,150_500_000+250_001,'fast',now,normal)
    expect(speciesId(game)).toBe(3);expect(activePet(game).xp).toBe(0)
    expect(game.captures).toHaveLength(1);expect(game.candyTokens).toBe(250_001);expect(candyCount(game)).toBe(2)
    advanceGame(game,49_999,'fast',now,normal)
    expect(candyCount(game)).toBe(3);expect(game.captures).toHaveLength(1);expect(game.pets).toHaveLength(1)
  })
  it('saves multiple individuals and unfinished eggs while selections change',()=>{
    const game=newGame();advanceGame(game,500_100,'fast',now,normal)
    const first=activePet(game).id
    gameAction(game,{type:'egg',eggType:'water'},'fast',now);advanceGame(game,200_000,'fast',now,normal)
    const egg=activePet(game).id
    gameAction(game,{type:'select',petId:first,phase:1},'fast',now)
    expect(activePet(game).xp).toBe(100)
    advanceGame(game,200,'fast',now,normal);expect(activePet(game).xp).toBe(300)
    gameAction(game,{type:'egg',eggType:'water'},'fast',now)
    expect(activePet(game).id).toBe(egg);expect(activePet(game).xp).toBe(200_000)
    advanceGame(game,300_000,'fast',now,normal)
    gameAction(game,{type:'egg',eggType:'grass'},'fast',now);advanceGame(game,500_000,'fast',now,normal)
    expect(dexChoices(game,1,false)).toHaveLength(2)
    expect(game.pets.find(p=>p.id===first)!.xp).toBe(300)
  })
  it('keeps completed earlier appearances completed and banks tokens',()=>{
    const game=newGame();advanceGame(game,150_500_000,'fast',now,normal)
    gameAction(game,{type:'select',petId:game.activeId,phase:1},'fast',now)
    expect(speciesId(game)).toBe(1);expect(isGrowing(game)).toBe(false)
    advanceGame(game,CANDY_XP,'fast',now,normal)
    expect(candyCount(game)).toBe(1);expect(activePet(game).phase).toBe(3)
    expect(()=>gameAction(game,{type:'candy',count:1},'fast',now)).toThrow('완료')
  })
  it('allows automatic growth and candies together without counting candy XP as new usage',()=>{
    const game=newGame();advanceGame(game,150_500_000+3*CANDY_XP,'fast',now,normal)
    gameAction(game,{type:'egg',eggType:'fire'},'fast',now);advanceGame(game,500_123,'fast',now,normal)
    const earned=game.tokensEarned
    gameAction(game,{type:'candy',count:2},'fast',now)
    expect(activePet(game).xp).toBe(200_123);expect(candyCount(game)).toBe(1);expect(game.tokensEarned).toBe(earned)
    advanceGame(game,10,'fast',now,normal);expect(activePet(game).xp).toBe(200_133)
  })
  it('spends only the XP needed to finish, preserving excess candy value',()=>{
    const game=newGame();advanceGame(game,150_500_000+5*CANDY_XP,'fast',now,normal)
    gameAction(game,{type:'egg',eggType:'fire'},'fast',now);advanceGame(game,150_500_000-1,'fast',now,normal)
    gameAction(game,{type:'candy',count:5},'fast',now)
    expect(speciesId(game)).toBe(6);expect(game.candyTokens).toBe(5*CANDY_XP-1)
    expect(game.captures).toHaveLength(2)
  })
  it('refuses candies on eggs and rejects invalid amounts/selections without changes',()=>{
    const game=newGame();game.candyTokens=CANDY_XP
    const before=structuredClone(game)
    expect(()=>gameAction(game,{type:'candy',count:1},'fast',now)).toThrow('알')
    expect(()=>gameAction(game,{type:'select',petId:'missing',phase:1},'fast',now)).toThrow()
    expect(game).toEqual(before)
    advanceGame(game,500_000,'fast',now,normal)
    for(const count of [0,-1,1.5,NaN,Infinity,2]) expect(()=>gameAction(game,{type:'candy',count},'fast',now)).toThrow()
  })
  it('rolls shiny once per hatch and keeps that variant through evolution and selection',()=>{
    const game=newGame();advanceGame(game,500_000,'fast',now,()=>0)
    expect(activePet(game).shiny).toBe(true);expect(game.owned).toEqual([]);expect(game.ownedShiny).toEqual([1])
    advanceGame(game,150_000_000,'fast',now,()=>{throw Error('do not reroll')})
    expect(game.ownedShiny).toEqual([1,2,3]);expect(game.captures[0].shiny).toBe(true)
    gameAction(game,{type:'egg',eggType:'grass'},'fast',now);advanceGame(game,500_000,'fast',now,normal)
    expect(game.owned).toEqual([1]);expect(dexChoices(game,1,true)).toHaveLength(1);expect(dexChoices(game,1,false)).toHaveLength(1)
  })
  it.each(EGG_TYPES.map(t=>t.id))('hatches a valid %s family and completes its actual chain',type=>{
    const game=newGame();gameAction(game,{type:'egg',eggType:type},'fast',now)
    advanceGame(game,500_000,'fast',now,normal)
    const pet=activePet(game),family=FAMILIES[pet.family!]
    expect(eggFamilies(type)).toContain(pet.family)
    advanceGame(game,150_000_000,'fast',now,normal)
    expect(speciesId(game)).toBe(family.species.at(-1));expect(pet.phase).toBe(family.species.length)
    expect(game.captures).toHaveLength(1)
  })
  it('preserves all saved growth percentages on pace changes and keeps the candy bank unchanged',()=>{
    const game=newGame();activePet(game).xp=250_000
    gameAction(game,{type:'egg',eggType:'water'},'fast',now);activePet(game).xp=100_000;game.candyTokens=123_456
    changePace(game,'fast','normal')
    expect(game.pets[0].xp/threshold(0,'normal')).toBe(.5);expect(activePet(game).xp/threshold(0,'normal')).toBe(.2)
    expect(game.candyTokens).toBe(123_456)
  })
  it('migrates old starter saves without replaying historical usage and preserves old final-stage XP as candy',()=>{
    const game=migrateGame({phase:3,family:1,xp:123_456,tokensEarned:999,owned:[1,2,3,4,5,6],captures:[{family:0,completedAt:now}]},now)
    expect(speciesId(game)).toBe(6);expect(game.candyTokens).toBe(123_456);expect(game.tokensEarned).toBe(999)
    expect(game.owned).toEqual([1,2,3,4,5,6]);expect(game.captures).toHaveLength(2)
    const egg=migrateGame({phase:0,family:null,xp:250_000,tokensEarned:100,owned:[],captures:[]},now)
    expect(activePet(egg).eggType).toBeNull();expect(activePet(egg).xp).toBe(250_000)
  })
  it('has a unique example catalog with an evolution chain for every egg type',()=>{
    expect(POKEMON).toHaveLength(52);expect(FAMILIES).toHaveLength(18)
    expect(new Set(POKEMON.map(p=>p.id)).size).toBe(52)
    for(const type of EGG_TYPES)expect(eggFamilies(type.id).length).toBeGreaterThan(0)
  })
  it('does not grow from invalid or negative usage',()=>{
    const game=newGame();for(const n of [-1,NaN,Infinity,1.2])advanceGame(game,n,'fast',now)
    expect(game).toEqual(newGame())
  })
})
