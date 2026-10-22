import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LEAGUE_GOALS, LEAGUE_SERIES, LEAGUE_BY_ID, leagueRequirements, leagueProgress, newLeague, registeredSpecies, unlockLeague, validateLeagueDisplay } from '../src/shared/league'
import { newGame } from '../src/shared/model'
import { POKEMON_BY_ID } from '../src/shared/catalog'
import { Store } from '../src/main/store'
import { removeTestDirectory } from './temp'
import badgeArt from '../src/shared/badge-art-catalog.json'

const now='2026-10-21T00:00:00Z',directories:string[]=[],stores:Store[]=[]
afterEach(()=>{for(const store of stores.splice(0))if(store.db.open)store.close();for(const dir of directories.splice(0))removeTestDirectory(dir)})
function open():Store {const dir=mkdtempSync(join(tmpdir(),'poketoken-league-'));directories.push(dir);const store=new Store(join(dir,'save.sqlite'));stores.push(store);return store}
function requirements(id:string):number[]{return leagueRequirements(LEAGUE_BY_ID.get(id)!)}
describe('league catalog and collection',()=>{
  it('maps all 199 badges by game and badge identity to intact local artwork without changing reward IDs',()=>{
    const bindings:Record<string,string>=badgeArt.goals
    const images:Record<string,{sha256:string;width:number;height:number;pixel:boolean;originals:{url:string;sha256:string}[]}>=badgeArt.assets
    expect(Object.keys(bindings).sort()).toEqual(LEAGUE_GOALS.filter(g=>g.kind==='badge').map(g=>g.id).sort())
    expect(new Set(Object.values(bindings)).size).toBe(136)
    for(const [id,metadata] of Object.entries(images)){
      const bytes=readFileSync(`src/renderer/public/badges/${id}.png`)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(metadata.sha256)
      expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a')
      expect(bytes.readUInt32BE(16)).toBe(metadata.width);expect(bytes.readUInt32BE(20)).toBe(metadata.height)
      expect(metadata.originals.length).toBeGreaterThan(0)
      for(const source of metadata.originals){expect(source.url).toMatch(/^https:\/\//);expect(source.sha256).toMatch(/^[a-f0-9]{64}$/)}
    }
    for(const ids of [['hgss-cascade','emerald-rain','sword-water','sv-water'],['hgss-rainbow','xy-plant','sword-grass']]){
      expect(new Set(ids.map(id=>images[bindings[id]].sha256)).size).toBe(ids.length)
    }
    expect(bindings['hgss-boulder']).not.toBe(bindings['rgb-boulder'])
    expect(bindings['sm-trial-water']).toBe('alola-water')
    expect(bindings['sm-grand-fighting']).toBe('alola-grand-fighting')
    expect(bindings['sm-grand-fighting']).not.toBe(bindings['sm-grand-rock'])
    expect(bindings['sword-water']).toBe(bindings['shield-water'])
    expect(bindings['rgb-champion']).toBeUndefined()
  })
  it('covers the mainline league editions with usable sources and valid non-empty parties',()=>{
    expect(LEAGUE_SERIES).toHaveLength(22);expect(LEAGUE_GOALS.filter(g=>g.kind==='badge')).toHaveLength(199)
    expect(LEAGUE_GOALS.filter(g=>g.kind==='title')).toHaveLength(22);expect(LEAGUE_BY_ID.size).toBe(LEAGUE_GOALS.length)
    for(const series of LEAGUE_SERIES)expect(LEAGUE_GOALS.filter(g=>g.series===series.id&&g.kind==='title')).toHaveLength(1)
    for(const goal of LEAGUE_GOALS){
      expect(LEAGUE_SERIES.some(s=>s.id===goal.series)).toBe(true);expect(goal.parties.length).toBeGreaterThan(0)
      for(const language of ['ko','en','ja'] as const)expect(goal.names[language]).toBeTruthy()
      for(const party of goal.parties){
        expect(party.source).toMatch(/^https:\/\/www\.serebii\.net\/[a-z0-9/.-]+\.shtml$/)
        expect(party.species.length).toBeGreaterThan(0);expect(party.species.length).toBeLessThanOrEqual(6)
        expect(new Set(party.species).size).toBe(party.species.length)
        for(const id of party.species)expect(POKEMON_BY_ID.has(id)&&id<=1025).toBe(true)
        for(const language of ['ko','en','ja'] as const)expect(party.trainer[language]).toBeTruthy()
      }
    }
  })
  it('uses researched final rematches and preserves version/starter variants without requiring duplicate individuals',()=>{
    expect(requirements('rgb-boulder')).toEqual([74,95])
    expect(requirements('hgss-boulder')).toEqual([76,369,139,141,409,95])
    expect(requirements('emerald-stone')).toEqual([142,76,139,141,208,299])
    expect(requirements('emerald-balance')).toEqual([289,242,115,128,327]) // Two Slaking require only one species.
    expect(requirements('b2w2-basic')).toEqual([508,474,573,463,351,626])
    expect(requirements('bdsp-champion')).toContain(474);expect(requirements('bdsp-champion')).not.toContain(407)
    expect(requirements('sv-champion')).toContain(652);expect(requirements('sv-champion')).not.toContain(672)
    expect(requirements('usum-trial-dragon')).toEqual([784,212,715]);expect(requirements('sm-trial-normal')).toEqual([735,734,20,19])
    expect(requirements('rgb-champion')).toEqual(expect.arrayContaining([3,6,9]));expect(requirements('rgb-champion')).not.toContain(1)
    expect(requirements('sm-champion')).toEqual(expect.arrayContaining([724,727,730]));expect(requirements('sm-champion')).not.toContain(722)
  })
  it('counts normal, shiny, regional and Mega records by species once and unlocks only after the whole goal',()=>{
    const game=newGame(),state=newLeague(),goal=LEAGUE_BY_ID.get('rgb-boulder')!
    game.appearances!.ownedShiny=[10109] // Alolan Geodude.
    expect(registeredSpecies(game).has(74)).toBe(true);expect(leagueProgress(goal,registeredSpecies(game)).missing).toEqual([95])
    expect(unlockLeague(game,state,now)).not.toContain(goal.id)
    game.ownedShiny.push(95);game.owned.push(95)
    expect(unlockLeague(game,state,now)).toContain(goal.id);expect(state.unlocked[goal.id]).toBe(now)
    game.appearances!.owned.push(10034);game.appearances!.ownedShiny.push(10034) // Mega Charizard X.
    expect([...registeredSpecies(game)].filter(id=>id===6)).toHaveLength(1)
    game.owned=[];game.ownedShiny=[];game.appearances!.ownedShiny=[]
    unlockLeague(game,state,'2027-01-01');expect(state.unlocked[goal.id]).toBe(now)
  })
  it('validates eight distinct acquired badges, a single acquired title, ordering and clearing',()=>{
    const state=newLeague(),badges=LEAGUE_GOALS.filter(g=>g.kind==='badge').slice(0,9).map(g=>g.id),title='rgb-champion'
    state.unlocked=Object.fromEntries([...badges,title].map(id=>[id,now]))
    expect(validateLeagueDisplay({badges:badges.slice(0,8).reverse(),title},state).badges).toEqual(badges.slice(0,8).reverse())
    for(const value of [{badges,title},{badges:[badges[0],badges[0]],title:null},{badges:[title],title:null},{badges:[],title:badges[0]},{badges:['no-such-goal'],title:null},{badges:[],title:'bb-champion'},{badges:[],title:undefined}])expect(()=>validateLeagueDisplay(value,state)).toThrow()
    expect(validateLeagueDisplay({badges:[],title:null},state)).toEqual({badges:[],title:null})
  })
  it('retroactively unlocks old saves without changing growth, rewards, language or candy and persists display',()=>{
    const store=open(),game=newGame();game.owned=Array.from({length:1025},(_,i)=>i+1);game.candyTokens=1234567
    store.set('game-v2',game);store.set('achievements-v1',{unlocked:{great:'2020-01-01'}});store.set('settings',{...store.settings,language:'ja'})
    const file=store.db.name;store.close();const reopened=new Store(file);stores.push(reopened)
    expect(Object.keys(reopened.league.unlocked)).toHaveLength(221);expect(reopened.game).toEqual(game);expect(reopened.settings.language).toBe('ja');expect(reopened.rewards.unlocked.great).toBe('2020-01-01')
    const badges=LEAGUE_GOALS.filter(g=>g.kind==='badge').slice(0,8).map(g=>g.id);reopened.updateLeague({badges:badges.reverse(),title:'bb-champion'})
    const expected=reopened.league;reopened.close();const last=new Store(file);stores.push(last);expect(last.league).toEqual(expected)
    expect(()=>last.updateLeague({badges:[...badges,'hgss-zephyr'],title:null})).toThrow();expect(last.league).toEqual(expected)
    last.updateLeague({badges:[],title:null});expect(last.league.badges).toEqual([]);expect(Object.keys(last.league.unlocked)).toHaveLength(221)
  })
  it('rolls back a failed display write without changing saved selections',()=>{
    const store=open(),state=newLeague();state.unlocked={'rgb-boulder':now};store.set('league-v1',state)
    store.db.exec("CREATE TRIGGER fail_league BEFORE INSERT ON meta WHEN NEW.key='league-v1' BEGIN SELECT RAISE(FAIL,'simulated disk failure'); END")
    expect(()=>store.updateLeague({badges:['rgb-boulder'],title:null})).toThrow();expect(store.league).toEqual(state)
  })
})
