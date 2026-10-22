import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/main/store'
import { newGame, type AutoHatchConfig, type UsageRecord } from '../src/shared/model'
import { activePet, advanceGame, autoHatchTargets, eggFamilies, gameAction, growthPath, threshold } from '../src/shared/game'
import { FAMILIES, HATCH_FAMILIES, EVOLUTIONS } from '../src/shared/catalog'
import { firstNormal, hatchRandom } from './hatch-random'
import { removeTestDirectory } from './temp'

const now='2026-10-21T00:00:00.000Z',config:AutoHatchConfig={eggType:'grass',targetId:null,variant:'any'}
const start=(game:ReturnType<typeof newGame>,value=config,random=firstNormal())=>gameAction(game,{type:'auto-hatch',config:value},'fast',now,random)
const directories:string[]=[],stores:Store[]=[]
afterEach(()=>{for(const store of stores.splice(0))if(store.db.open)store.close();for(const dir of directories.splice(0))removeTestDirectory(dir)})
describe('automatic hatching',()=>{
  it('keeps every hatched individual, earlier growth, variants, balls and XP; carries overflow to the same egg type',()=>{
    const game=newGame();advanceGame(game,512_345,'fast',now,firstNormal());activePet(game).ball='great'
    const previous=structuredClone(activePet(game));start(game)
    expect(advanceGame(game,1_750_000,'fast',now,firstNormal())).toBe('부화 3회')
    expect(game.pets[0]).toEqual(previous);expect(game.pets.filter(p=>p.phase===1)).toHaveLength(4)
    expect(activePet(game)).toMatchObject({phase:0,eggType:'grass',xp:250_000})
    expect(game.autoHatch).toMatchObject({enabled:true,hatched:3});expect(game.candyTokens).toBe(0)
    expect(game.tokensEarned).toBe(2_262_345)
    expect(new Set(game.pets.map(p=>p.id)).size).toBe(game.pets.length)
  })
  it('chooses a fresh random type each time, and preserves/reuses stored egg progress',()=>{
    const game=newGame();activePet(game).xp=100
    const values=[0,0,.5,2.5/18,0,.5,4.5/18],random=()=>values.shift()??.5
    start(game,{...config,eggType:'random'},random);advanceGame(game,1_000_017,'fast',now,random)
    expect(game.pets.filter(p=>p.phase===1).map(p=>p.eggType)).toEqual(['normal','water'])
    expect(activePet(game)).toMatchObject({id:'pet:1',phase:0,eggType:'grass',xp:117})
    expect(game.autoHatch?.hatched).toBe(2)
  })
  it.each(['normal','shiny','any'] as const)('stops only on a newly hatched matching %s target, and grows it with leftover/new tokens',variant=>{
    const game=newGame();game.owned=[1];start(game,{...config,targetId:1,variant})
    const values=variant==='normal'?[0,0,0,.5]:variant==='shiny'?[0,.5,0,0]:[0,.5]
    const count=variant==='any'?1:2
    const notice=advanceGame(game,500_000*count+123,'fast',now,()=>values.shift()??.5)
    expect(notice).toContain('자동 부화 목표 달성!');expect(game.autoHatch).toMatchObject({enabled:false,hatched:count,matchedPetId:game.activeId})
    expect(activePet(game)).toMatchObject({phase:1,xp:123,shiny:variant==='shiny'});expect(growthPath(activePet(game))).toEqual([1])
    if(count===2){expect(game.owned).toContain(1);expect(game.ownedShiny).toContain(1)}
    advanceGame(game,77,'fast',now,firstNormal());expect(activePet(game).xp).toBe(200)
    expect(game.pets.filter(p=>p.phase===0)).toHaveLength(0)
  })
  it('preserves a missed hatch and its independent growth when another species is the target',()=>{
    const game=newGame();start(game,{...config,targetId:1});const grass=eggFamilies('grass').find(f=>FAMILIES[f].species[0]!==1)!
    advanceGame(game,500_001,'fast',now,hatchRandom(grass))
    expect(game.autoHatch).toMatchObject({enabled:true,hatched:1,matchedPetId:null})
    expect(growthPath(game.pets[0])[0]).not.toBe(1);expect(game.pets[0].xp).toBe(0);expect(activePet(game).xp).toBe(1)
  })
  it('registers non-evolving hatches as complete and keeps regional forms separate',()=>{
    for(const regional of [false,true]){
      const family=HATCH_FAMILIES.find(f=>regional?f.species[0]>1025:!(EVOLUTIONS[f.species[0]]??[]).length)!
      const game=newGame();start(game,{eggType:family.eggTypes[0],targetId:null,variant:'any'})
      advanceGame(game,500_000,'fast',now,hatchRandom(family.family,true))
      const id=family.species[0]
      expect(regional?game.appearances!.ownedShiny:game.ownedShiny).toContain(id)
      if(!regional)expect(game.captures[0].speciesId).toBe(id)
      expect(activePet(game).phase).toBe(0)
    }
  })
  it('offers only actual hatch roots, with the original rarity/shiny draw and all pace thresholds',()=>{
    for(const type of ['grass','fairy','ice'] as const)expect(autoHatchTargets(type)).toEqual(eggFamilies(type).map(f=>FAMILIES[f].species[0]))
    expect(autoHatchTargets('fairy')).not.toContain(700);expect(autoHatchTargets('grass')).not.toContain(2)
    for(const pace of ['fast','normal','slow'] as const){const game=newGame();start(game);advanceGame(game,threshold(0,pace)*2+1,pace,now,firstNormal());expect(game.autoHatch?.hatched).toBe(2);expect(activePet(game).xp).toBe(1)}
  })
  it('rejects malformed and unreachable targets without changing progress or settings',()=>{
    const game=newGame(),before=structuredClone(game)
    for(const value of [{...config,targetId:2},{...config,targetId:7},{...config,eggType:'random',targetId:1},{...config,variant:'fake'},{eggType:'grass'}]){
      expect(()=>start(game,value as AutoHatchConfig)).toThrow('자동 부화');expect(game).toEqual(before)
    }
  })
  it('stopping and manually selecting a pet or egg preserve the partial egg; invalid switches do not stop the run',()=>{
    const game=newGame();start(game);advanceGame(game,750_000,'fast',now,firstNormal());const id=game.activeId
    expect(()=>gameAction(game,{type:'select',petId:'absent',phase:1},'fast',now)).toThrow();expect(game.autoHatch?.enabled).toBe(true)
    gameAction(game,{type:'select',petId:game.pets[0].id,phase:1},'fast',now);expect(game.autoHatch?.enabled).toBe(false)
    start(game);expect(activePet(game)).toMatchObject({id,xp:250_000})
    gameAction(game,{type:'auto-hatch',config:null},'fast',now);expect(activePet(game).xp).toBe(250_000)
    start(game);gameAction(game,{type:'egg',eggType:'water'},'fast',now);expect(game.autoHatch?.enabled).toBe(false)
  })
  it('atomically persists the run, hatch history and usage high-water mark through restart, offline usage and failure',()=>{
    const dir=mkdtempSync(join(tmpdir(),'poketoken-auto-hatch-'));directories.push(dir)
    const path=join(dir,'test.sqlite');let store=new Store(path);stores.push(store)
    store.act({type:'auto-hatch',config})
    const record:UsageRecord={id:'run',provider:'claude',timestamp:now,input:1_250_000,output:0,cacheRead:0,cacheWrite:0}
    const linked=new Map([['run','2000-01-01T00:00:00.000Z']])
    store.sync([record],new Set(),linked,firstNormal());const saved=store.game;store.close()
    store=new Store(path);stores.push(store);expect(store.game).toEqual(saved)
    store.sync([record],new Set(),linked,firstNormal());expect(store.game).toEqual(saved)
    const offline={...record,input:1_750_000};store.sync([offline],new Set(),linked,firstNormal())
    expect(store.game.autoHatch?.hatched).toBe(3);expect(activePet(store.game).xp).toBe(250_000)
    const before=store.game;store.db.exec("CREATE TRIGGER reject_auto BEFORE INSERT ON meta WHEN NEW.key='game-v2' BEGIN SELECT RAISE(ABORT, 'failure'); END")
    expect(()=>store.sync([{...record,input:2_750_000}],new Set(),linked,firstNormal())).toThrow('failure')
    expect(store.game).toEqual(before);store.db.exec('DROP TRIGGER reject_auto')
    store.sync([{...record,input:2_750_000}],new Set(),linked,firstNormal());expect(store.game.autoHatch?.hatched).toBe(5)
  })
})
