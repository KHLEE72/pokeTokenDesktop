import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Store } from '../src/main/store'
import { ALL_POKEMON, EVOLUTIONS, FAMILIES, FORMS, GROWTH_FORMS, MEGA_FORMS, MEGA_STONES, POKEMON } from '../src/shared/catalog'
import { activePet, advanceGame, appearanceId, candyCount, CANDY_XP, dexChoices, gameAction, growthPath, isGrowing, speciesId, threshold } from '../src/shared/game'
import { appearanceCollection, collectedAppearance, megaUnlocked, stonePrice } from '../src/shared/mega'
import { newGame, GameState } from '../src/shared/model'
import { localizeMessage, pokemonName } from '../src/shared/i18n'
import { pickDialogue } from '../src/shared/dialogue'
import { spriteSources } from '../src/shared/sprites'
import { rarityDiscoveries, unlockRewards } from '../src/shared/rewards'
import { hatchRandom } from './hatch-random'
import { removeTestDirectory } from './temp'

const now='2026-10-16T00:00:00Z',stores:Store[]=[],directories:string[]=[]
afterEach(()=>{for(const s of stores.splice(0))if(s.db.open)s.close();for(const d of directories.splice(0))removeTestDirectory(d)})
function completed(id=6,shiny=false):GameState {
  const game=newGame(),pet=activePet(game)
  Object.assign(pet,{family:1,phase:3,xp:0,path:[4,5,id],shiny,ball:'great'})
  game.displayPhase=3;(shiny?game.ownedShiny:game.owned).push(4,5,id)
  return game
}
describe('regional and Mega appearance catalog',()=>{
  it('keeps all 1025 defaults and adds distinct regional, Mega and prerequisite appearances',()=>{
    expect(POKEMON).toHaveLength(1025);expect(ALL_POKEMON).toHaveLength(1185)
    expect(FORMS.filter(f=>f.kind==='regional')).toHaveLength(57)
    expect(MEGA_FORMS).toHaveLength(97);expect(GROWTH_FORMS).toHaveLength(63)
    expect(new Set(ALL_POKEMON.map(p=>p.id)).size).toBe(1185)
    expect(MEGA_STONES).toHaveLength(93)
    for(const form of FORMS)for(const lang of ['ko','en','ja'] as const){
      expect(pokemonName(form.id,lang)).not.toBe('Pokémon')
      if(lang!=='ko')expect(pokemonName(form.id,lang)).not.toMatch(/[가-힣]/)
      for(const event of ['idle','held','falling','landing','growth','usage','petting'] as const){
        const line=pickDialogue(form.id,event,undefined,()=>0,lang)
        expect(line).toBeTruthy();expect(line).not.toMatch(/little shell|からの中|알 속/)
      }
    }
    expect(MEGA_STONES.find(s=>s.id==='floettite')?.names.ko).toBe('플라엣테나이트')
    expect(MEGA_STONES.find(s=>s.id==='dragon-ascent')?.kind).toBe('technique')
  })
  it('has a normal and shiny image source for every appearance, without using normal art for a shiny',()=>{
    for(const form of FORMS){
      const normal=spriteSources(form.id),shiny=spriteSources(form.id,true)
      expect(normal.length,form.identifier).toBeGreaterThan(0);expect(shiny.length,form.identifier).toBeGreaterThan(0)
      expect(shiny.every(source=>source.url.includes('/shiny/'))).toBe(true)
      expect(normal.every(source=>!source.url.includes('/shiny/'))).toBe(true)
    }
  })
  it('hatches regional roots with their own types, preserves shiny and evolves along the regional route',()=>{
    const family=FAMILIES.find(f=>f.species[0]===10174)!,game=newGame()
    gameAction(game,{type:'egg',eggType:'dark'},'fast',now)
    advanceGame(game,500_000,'fast',now,hatchRandom(family.family,true))
    expect(speciesId(game)).toBe(10174);expect(game.ownedShiny).toEqual([])
    expect(appearanceCollection(game).ownedShiny).toEqual([10174])
    advanceGame(game,150_000_123,'fast',now)
    expect(growthPath(activePet(game))).toEqual([10174,10175,862])
    expect(game.ownedShiny).toEqual([862]);expect(game.captures[0].speciesId).toBe(862)
    expect(dexChoices(game,862,true)[0].phase).toBe(3);expect(game.candyTokens).toBe(123)
    gameAction(game,{type:'select',petId:game.activeId,phase:2},'fast',now)
    expect(speciesId(game)).toBe(10175);expect(isGrowing(game)).toBe(false)
  })
  it('keeps old independent regional evolutions selectable without fabricating an earlier regional path',()=>{
    const game=newGame(),pet=activePet(game),family=FAMILIES.find(f=>f.species[0]===862)!
    Object.assign(pet,{family:family.family,phase:1,path:[862]});game.displayPhase=1;game.owned=[862]
    expect(dexChoices(game,862,false)).toEqual([pet]);expect(dexChoices(game,10175,false)).toEqual([])
    expect(isGrowing(game)).toBe(false)
  })
  it('offers regional destinations only at the correct evolution stage and does not cross normal/regional routes',()=>{
    expect(EVOLUTIONS[25]).toEqual([26,10100]);expect(EVOLUTIONS[19]).toEqual([20])
    expect(EVOLUTIONS[10164]).toEqual([10165,10172]);expect(EVOLUTIONS[10175]).toEqual([862])
    expect(EVOLUTIONS[10166]).toEqual([865]);expect(EVOLUTIONS[10247]).toEqual([902])
    expect(EVOLUTIONS[550]).toEqual([]);expect(EVOLUTIONS[10061]).toEqual([])
    const game=newGame(),pet=activePet(game)
    Object.assign(pet,{family:4,phase:2,path:[172,25],xp:threshold(2,'fast')});game.displayPhase=2
    gameAction(game,{type:'target',speciesId:10100},'fast',now)
    expect(speciesId(game)).toBe(10100);expect(game.owned).toEqual([])
    expect(appearanceCollection(game).owned).toEqual([10100])
    expect(game.captures[0].speciesId).toBe(10100)
  })
  it('does not copy fire dialogue into ice Vulpix or flying landing dialogue into Galarian Zapdos',()=>{
    for(const lang of ['ko','en','ja'] as const){
      expect(pickDialogue(10103,'idle',undefined,()=>0,lang)).not.toMatch(/불꽃|flame|炎/)
      expect(pickDialogue(10170,'landing',undefined,()=>0,lang)).not.toMatch(/날개|wings|翼/)
    }
  })
})
describe('permanent Mega unlocks and candy accounting',()=>{
  it('allows exactly one free choice, then charges exactly 50 candies and keeps partial candy XP',()=>{
    const game=completed();game.candyTokens=50*CANDY_XP+12_345
    gameAction(game,{type:'mega-stone',stone:'charizardite-x'},'fast',now)
    expect(stonePrice(game)).toBe(50);expect(game.candyTokens).toBe(5_012_345)
    gameAction(game,{type:'mega-stone',stone:'charizardite-y'},'fast',now)
    expect(game.candyTokens).toBe(12_345);expect(candyCount(game)).toBe(0)
    expect(appearanceCollection(game).megaStones).toEqual(['charizardite-x','charizardite-y'])
    const before=structuredClone(game)
    expect(()=>gameAction(game,{type:'mega-stone',stone:'charizardite-x'},'fast',now)).toThrow('이미')
    expect(game).toEqual(before)
  })
  it('rejects invalid/unusable purchases without consuming the free choice, and cannot buy a missing candy',()=>{
    const game=completed(),before=structuredClone(game)
    for(const stone of ['fake-stone','venusaurite'])expect(()=>gameAction(game,{type:'mega-stone',stone},'fast',now)).toThrow()
    expect(game).toEqual(before)
    gameAction(game,{type:'mega-stone',stone:'charizardite-x'},'fast',now)
    game.candyTokens=50*CANDY_XP-1
    expect(()=>gameAction(game,{type:'mega-stone',stone:'charizardite-y'},'fast',now)).toThrow('부족')
  })
  it('toggles Mega appearance while preserving growth, ball, captures and XP; new tokens remain candy',()=>{
    const game=completed();gameAction(game,{type:'mega-stone',stone:'charizardite-x'},'fast',now)
    const pet=activePet(game),path=[...growthPath(pet)]
    gameAction(game,{type:'mega',formId:10034},'fast',now)
    expect(speciesId(game)).toBe(6);expect(appearanceId(game)).toBe(10034)
    expect(collectedAppearance(game,10034,false)).toBe(true)
    advanceGame(game,123_456,'fast',now)
    expect(game.candyTokens).toBe(123_456);expect(growthPath(pet)).toEqual(path)
    expect(pet.phase).toBe(3);expect(pet.ball).toBe('great');expect(game.captures).toEqual([])
    gameAction(game,{type:'mega',formId:null},'fast',now)
    expect(appearanceId(game)).toBe(6);expect(megaUnlocked(game,10034)).toBe(true)
  })
  it('shares purchased stones with shiny and other individuals without inventing a shiny appearance record',()=>{
    const game=completed();gameAction(game,{type:'mega-stone',stone:'charizardite-x'},'fast',now)
    const shiny={...activePet(game),id:'pet:2',shiny:true};game.pets.push(shiny);game.ownedShiny=[4,5,6]
    expect(collectedAppearance(game,10034,true)).toBe(false)
    gameAction(game,{type:'mega',formId:10034,petId:'pet:2'},'fast',now)
    expect(appearanceId(game)).toBe(10034);expect(activePet(game).shiny).toBe(true)
    expect(collectedAppearance(game,10034,true)).toBe(true);expect(collectedAppearance(game,10034,false)).toBe(false)
  })
  it('does not Mega Evolve a regional Slowbro with an ordinary Slowbro stone or a still-growing Floette',()=>{
    const game=completed(),pet=activePet(game)
    Object.assign(pet,{family:0,phase:1,path:[10165]});game.displayPhase=1;game.owned=[80]
    gameAction(game,{type:'mega-stone',stone:'slowbronite'},'fast',now)
    expect(()=>gameAction(game,{type:'mega',formId:10071},'fast',now)).toThrow()
    game.owned=[670]
    expect(()=>gameAction(game,{type:'mega-stone',stone:'floettite'},'fast',now)).toThrow()
    game.appearances!.owned.push(10061);game.candyTokens=50*CANDY_XP
    gameAction(game,{type:'mega-stone',stone:'floettite'},'fast',now)
    expect(appearanceCollection(game).megaStones).toContain('floettite')
  })
  it('counts regional legendary species once, keeps the original master reward, and translates new notices',()=>{
    const game=newGame();game.owned=[144];game.appearances!.owned=[10169];game.appearances!.ownedShiny=[10169]
    expect(rarityDiscoveries(game,'sublegendary')).toBe(1)
    const rewards={unlocked:{}};unlockRewards(game,rewards,now)
    expect(rewards.unlocked).toHaveProperty('luxury')
    for(const message of ['메가스톤을 영구 해금했어요. 같은 종의 모든 친구가 함께 사용해요.','메가진화한 모습으로 함께해요. 새 토큰은 사탕으로 모입니다.','원래 모습으로 돌아왔어요.'])for(const lang of ['en','ja'] as const)expect(localizeMessage(message,lang)).not.toMatch(/[가-힣]/)
  })
})
describe('appearance storage migration and transactions',()=>{
  function open(path:string):Store{const store=new Store(path);stores.push(store);return store}
  it('adds a one-time appearance collection to old saves while preserving every old field and a backup',()=>{
    const directory=mkdtempSync(join(tmpdir(),'poketoken-forms-'));directories.push(directory)
    const path=join(directory,'game.sqlite'),store=open(path),old=completed();delete old.appearances
    old.candyTokens=123_456;old.tokensEarned=999;store.set('game-v2',old);store.close()
    const migrated=open(path),game=migrated.game
    expect({...game,appearances:undefined}).toEqual({...old,appearances:undefined})
    expect(migrated.get('game-before-appearances')).toEqual(old)
    migrated.act({type:'mega-stone',stone:'charizardite-x'});migrated.act({type:'mega',formId:10034})
    const saved=migrated.game;migrated.close()
    const reopened=open(path)
    expect(reopened.game).toEqual(saved);expect(appearanceId(reopened.game)).toBe(10034)
    expect(stonePrice(reopened.game)).toBe(50)
    expect(()=>reopened.act({type:'mega-stone',stone:'charizardite-y'})).toThrow()
    expect(reopened.game).toEqual(saved)
  })
  it('rolls back the purchase and free choice together when saving fails',()=>{
    const directory=mkdtempSync(join(tmpdir(),'poketoken-forms-'));directories.push(directory)
    const store=open(join(directory,'game.sqlite'));store.set('game-v2',completed())
    const before=store.game
    store.db.exec("CREATE TRIGGER fail_form_insert BEFORE INSERT ON meta WHEN NEW.key='game-v2' BEGIN SELECT RAISE(ABORT,'test failure'); END")
    expect(()=>store.act({type:'mega-stone',stone:'charizardite-x'})).toThrow('test failure')
    expect(store.game).toEqual(before)
  })
})
