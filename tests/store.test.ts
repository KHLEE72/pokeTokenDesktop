import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/main/store'
import { UsageRecord } from '../src/shared/model'
import { activePet, advanceGame, gameAction, speciesId } from '../src/shared/game'
import { removeTestDirectory } from './temp'
import { firstNormal, hatchRandom } from './hatch-random'
import { FAMILIES } from '../src/shared/catalog'
const stores: Store[] = [], dirs: string[] = []
const make = (): { path: string; store: Store } => {
  const dir = mkdtempSync(join(tmpdir(), 'poketoken-store-')); dirs.push(dir)
  const path = join(dir, 'test.sqlite'), store = new Store(path); stores.push(store); return { path, store }
}
afterEach(() => { for (const store of stores.splice(0)) if (store.db.open) store.close(); for (const dir of dirs.splice(0)) removeTestDirectory(dir) })
const record = (id: string, input: number): UsageRecord => ({ id, provider: 'claude', timestamp: new Date().toISOString(), input, output: 0, cacheRead: 0, cacheWrite: 0 })
const linked = (records: UsageRecord[]) => new Map(records.map(r=>[r.id,'2000-01-01T00:00:00.000Z']))
describe('atomic usage ledger', () => {
  it('retains all legacy family stages, actual paths, settings and a previously earned Master reward with the expanded catalog',()=>{
    const {path,store}=make(),game=store.game,now=new Date().toISOString()
    game.pets=FAMILIES.slice(0,19).map(f=>({id:`pet:${f.family+1}`,family:f.family,phase:f.family===18?2:f.species.length,xp:0,shiny:f.family%2===0,eggType:f.eggTypes[0],obtainedAt:now,path:f.family===18?[133,700]:[...f.species],evolutionTarget:null,ball:'master'}))
    game.pets.push({id:'pet:20',family:0,phase:1,xp:12_345,shiny:false,eggType:'grass',obtainedAt:now,path:[1],evolutionTarget:null})
    game.nextId=21;game.activeId='pet:20';game.displayPhase=1;game.candyTokens=123_456;game.tokensEarned=987_654
    game.owned=game.pets.filter(p=>!p.shiny).flatMap(p=>p.path!);game.ownedShiny=game.pets.filter(p=>p.shiny).flatMap(p=>p.path!)
    game.captures=game.pets.slice(0,19).map(p=>({petId:p.id,family:p.family!,speciesId:p.path!.at(-1)!,shiny:p.shiny,completedAt:now}))
    store.set('game-v2',game);store.set('achievements-v1',{unlocked:{master:now}})
    store.updateSettings({language:'ja',dexSort:'acquired',theme:'master'});const settings=store.settings;store.close()
    const reopened=new Store(path);stores.push(reopened)
    expect(reopened.game).toEqual(game);expect(reopened.settings).toEqual(settings)
    expect(reopened.rewards.unlocked.master).toBe(now)
    const incoming=record('new-roster',100);reopened.sync([incoming],new Set(),linked([incoming]))
    expect(activePet(reopened.game).xp).toBe(12_445);expect(reopened.game.tokensEarned).toBe(987_754)
    reopened.close();const again=new Store(path);stores.push(again)
    again.sync([incoming],new Set(),linked([incoming]));expect(activePet(again.game).xp).toBe(12_445)
  })
  it('baselines history, counts only increases, and survives restart', () => {
    const { path, store } = make(), old = record('old',100)
    store.sync([old],new Set(['old']),linked([old]))
    expect(store.game.tokensEarned).toBe(0)
    const updated = record('old',150), added = record('new',500_000)
    store.sync([updated,added],new Set(),linked([updated,added]))
    expect(store.game.tokensEarned).toBe(500_050); expect(activePet(store.game).phase).toBe(1)
    store.close()
    const reopened = new Store(path); stores.push(reopened)
    reopened.sync([updated,added],new Set(),linked([updated,added]))
    expect(reopened.game.tokensEarned).toBe(500_050)
    const offline = record('offline',10)
    reopened.sync([offline],new Set(),linked([offline]))
    expect(reopened.game.tokensEarned).toBe(500_060)
  })
  it('does not award experience for old records appearing after linking', () => {
    const { store } = make(), old = record('old',1_000_000); old.timestamp='2000-01-01T00:00:00.000Z'
    store.sync([old],new Set(),new Map([[old.id,'2026-10-01T00:00:00.000Z']]))
    expect(store.game.tokensEarned).toBe(0); expect(store.snapshot().usage.claude.all).toBe(1_000_000)
  })
  it('does not re-award corrected downward totals and preserves earliest dates', () => {
    const { store } = make(), r=record('id',100)
    store.sync([r],new Set(),linked([r]))
    store.sync([{...r,input:80}],new Set(),linked([r]))
    store.sync([r],new Set(),linked([r]))
    expect(store.game.tokensEarned).toBe(100)
  })
  it('rolls back both ledger and growth if a transaction fails', () => {
    const { store } = make(), r=record('id',500_000)
    expect(()=>store.sync([r],new Set(),linked([r]),()=>{throw new Error('failure')})).toThrow()
    expect(store.game.tokensEarned).toBe(0); expect(store.snapshot().usage.claude.all).toBe(0)
    store.sync([r],new Set(),linked([r]),()=>0)
    expect(store.game.tokensEarned).toBe(500_000)
  })
  it('keeps progress on a pace change and persists settings', () => {
    const {store}=make(), game=store.game; activePet(game).xp=250_000; store.set('game-v2',game)
    store.updateSettings({pace:'slow',size:192})
    expect(activePet(store.game).xp).toBe(5_000_000); expect(store.settings.size).toBe(192)
  })
  it('adds the light theme to older settings without changing roots or growth, and persists dark mode', () => {
    const {path,store}=make(), settings=store.settings, game=store.game
    activePet(game).xp=250_000;store.set('game-v2',game)
    const {theme:_,...legacy}=settings
    legacy.roots={claude:['C:/logs/claude'],codex:['C:/logs/codex']};legacy.size=192
    store.set('settings',legacy);store.close()
    const migrated=new Store(path);stores.push(migrated)
    expect(migrated.settings).toEqual({...legacy,theme:'light'})
    expect(migrated.game).toEqual(game)
    migrated.updateSettings({theme:'dark'});migrated.close()
    const reopened=new Store(path);stores.push(reopened)
    expect(reopened.settings).toEqual({...legacy,theme:'dark'})
    expect(reopened.game).toEqual(game)
  })
  it('keeps an original growth backup and upgrades existing paths and capture identities exactly once',()=>{
    const {path,store}=make(),game=store.game
    advanceGame(game,150_600_001,'fast',new Date().toISOString(),firstNormal())
    delete activePet(game).path;delete activePet(game).evolutionTarget;delete game.captures[0].speciesId
    store.set('game-v2',game);store.close()
    const reopened=new Store(path);stores.push(reopened)
    expect(reopened.get('game-before-branches')).toEqual(game)
    expect(activePet(reopened.game).path).toEqual([1,2,3]);expect(reopened.game.captures[0].speciesId).toBe(3)
    expect(reopened.game.candyTokens).toBe(100_001);expect(reopened.game.tokensEarned).toBe(150_600_001)
    reopened.updateSettings({theme:'dark'});reopened.close()
    const twice=new Store(path);stores.push(twice)
    expect(twice.get('game-before-branches')).toEqual(game);expect(twice.settings.theme).toBe('dark')
  })
  it('persists a waiting Eevee and its chosen branch without double credit after rescan or restart',()=>{
    const {path,store}=make(),game=store.game,now=new Date().toISOString()
    gameAction(game,{type:'egg',eggType:'normal'},'fast',now);advanceGame(game,500_000,'fast',now,hatchRandom(18))
    store.set('game-v2',game)
    const r=record('branch',50_150_001);store.sync([r],new Set(),linked([r]))
    expect(activePet(store.game).xp).toBe(50_000_000);expect(store.game.candyTokens).toBe(150_001)
    store.close();const reopened=new Store(path);stores.push(reopened)
    reopened.sync([r],new Set(),linked([r]));expect(reopened.game.candyTokens).toBe(150_001)
    reopened.act({type:'target',speciesId:197});expect(speciesId(reopened.game)).toBe(197)
    const completed=reopened.game
    expect(completed.captures[0].speciesId).toBe(197)
    expect(()=>reopened.act({type:'target',speciesId:700})).toThrow();expect(reopened.game).toEqual(completed)
    reopened.close();const twice=new Store(path);stores.push(twice)
    twice.sync([r],new Set(),linked([r]));expect(twice.game).toEqual(completed)
  })
  it('remembers an unfinished evolution goal and credits offline evolution once',()=>{
    const {path,store}=make(),game=store.game,now=new Date().toISOString()
    gameAction(game,{type:'egg',eggType:'normal'},'fast',now);advanceGame(game,500_000,'fast',now,hatchRandom(18))
    store.set('game-v2',game);store.act({type:'target',speciesId:700});store.close()
    const reopened=new Store(path);stores.push(reopened)
    expect(activePet(reopened.game).evolutionTarget).toBe(700)
    const r=record('offline-branch',50_100_001)
    reopened.sync([r],new Set(),linked([r]));expect(speciesId(reopened.game)).toBe(700)
    expect(reopened.game.candyTokens).toBe(100_001)
    const completed=reopened.game;reopened.close()
    const twice=new Store(path);stores.push(twice)
    twice.sync([r],new Set(),linked([r]));expect(twice.game).toEqual(completed)
  })
  it('migrates once, retains the old game and ledger, and persists selections and candies',()=>{
    const {path,store}=make(),r=record('counted',150_600_000)
    store.sync([r],new Set(),linked([r]),firstNormal())
    const legacy={phase:3,family:0,xp:200_000,tokensEarned:150_600_000,owned:[1,2,3],captures:[]}
    store.set('game',legacy);store.db.prepare("DELETE FROM meta WHERE key='game-v2'").run();store.close()
    const updated=new Store(path);stores.push(updated)
    expect(updated.get('game')).toEqual(legacy);expect(updated.game.candyTokens).toBe(200_000)
    updated.sync([r],new Set(),linked([r]),firstNormal())
    expect(updated.game.candyTokens).toBe(200_000);expect(updated.game.tokensEarned).toBe(150_600_000)
    updated.act({type:'egg',eggType:'fire'});const id=updated.game.activeId;updated.close()
    const restarted=new Store(path);stores.push(restarted)
    expect(restarted.game.activeId).toBe(id);expect(restarted.game.candyTokens).toBe(200_000)
  })
  it('rolls back invalid candy actions and never credits a restarted bank twice',()=>{
    const {path,store}=make(),r=record('final',150_600_001)
    store.sync([r],new Set(),linked([r]),firstNormal())
    const before=store.game
    expect(()=>store.act({type:'candy',count:1})).toThrow();expect(store.game).toEqual(before)
    store.close();const restarted=new Store(path);stores.push(restarted)
    restarted.sync([r],new Set(),linked([r]),firstNormal())
    expect(restarted.game.candyTokens).toBe(100_001)
  })
})
