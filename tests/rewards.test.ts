import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/main/store'
import { activePet, advanceGame } from '../src/shared/game'
import { newGame, POKEMON, UsageRecord } from '../src/shared/model'
import { ballUnlocked, RewardState, themeUnlocked, unlockRewards } from '../src/shared/rewards'
import { removeTestDirectory } from './temp'

const stores: Store[] = [], directories: string[] = []
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'poketoken-rewards-')); directories.push(directory)
  const path = join(directory, 'test.sqlite'), store = new Store(path); stores.push(store)
  return { store, path, reopen: () => { store.close(); const next = new Store(path); stores.push(next); return next } }
}
afterEach(() => { for (const store of stores.splice(0)) if (store.db.open) store.close(); for (const dir of directories.splice(0)) removeTestDirectory(dir) })
const record = (id: string, input: number): UsageRecord => ({ id, input, provider: 'codex', timestamp: new Date().toISOString(), output: 0, cacheRead: 0, cacheWrite: 0 })
const linked = (records: UsageRecord[]) => new Map(records.map(r => [r.id, '2000-01-01T00:00:00.000Z']))

describe('achievement rewards and saved balls', () => {
  it('backfills older saves without altering growth, candy, paths, settings or usage', () => {
    const rig = setup(), game = rig.store.game
    advanceGame(game, 150_700_000, 'fast', new Date().toISOString(), () => .5)
    rig.store.set('game-v2', game)
    const settings = rig.store.settings
    const migrated = rig.reopen()
    expect(migrated.game).toEqual(game); expect(migrated.settings).toEqual(settings)
    expect(Object.keys(migrated.rewards.unlocked).sort()).toEqual(['great', 'premier', 'ultra'])
    expect(migrated.snapshot().usage.codex.all).toBe(0)
  })
  it('ignores historical baselines, awards on new usage and never awards again on rescan', () => {
    const { store } = setup(), old = record('old', 100_000_000)
    store.sync([old], new Set([old.id]), linked([old]))
    expect(store.rewards.unlocked).toEqual({})
    const fresh = record('fresh', 1_000_000)
    store.sync([fresh], new Set(), linked([fresh]), () => .5)
    const rewards = store.rewards
    expect(ballUnlocked(rewards, 'great')).toBe(true)
    store.sync([old, fresh], new Set(), linked([old, fresh]), () => .5)
    expect(store.rewards).toEqual(rewards); expect(store.game.tokensEarned).toBe(1_000_000)
    const updated = { ...fresh, input: 50_000_000 }
    store.sync([updated], new Set(), linked([updated]), () => .5)
    expect(ballUnlocked(store.rewards, 'ultra')).toBe(true)
  })
  it('rejects locked rewards through storage, then persists independent balls, themes and ball mode', () => {
    const rig = setup(), game = rig.store.game
    advanceGame(game, 500_000, 'fast', new Date().toISOString(), () => .5); rig.store.set('game-v2', game)
    expect(() => rig.store.updateSettings({ theme: 'luxury' })).toThrow('아직 얻지 못한')
    expect(() => rig.store.act({ type: 'ball', petId: game.activeId, ball: 'great' })).toThrow('선택할 수 없는')
    expect(rig.store.game).toEqual(game)
    rig.store.sync([record('new', 1_000_000)], new Set(), linked([record('new', 1_000_000)]), () => .5)
    rig.store.act({ type: 'ball', petId: game.activeId, ball: 'great' })
    rig.store.updateSettings({ theme: 'dark', inBall: true })
    const current = rig.store.game, rewards = rig.store.rewards
    const reopened = rig.reopen()
    expect(activePet(reopened.game).ball).toBe('great'); expect(reopened.settings.theme).toBe('dark'); expect(reopened.settings.inBall).toBe(true)
    expect(reopened.game).toEqual(current); expect(reopened.rewards).toEqual(rewards)
    reopened.updateSettings({ theme: 'great' }); reopened.act({ type: 'egg', eggType: 'fire' })
    expect(reopened.settings.inBall).toBe(false); expect(reopened.settings.theme).toBe('great')
    expect(() => reopened.updateSettings({ inBall: true })).toThrow('알이 부화')
  })
  it('keeps separate balls for separate individuals and preserves the ball through evolution', () => {
    const { store } = setup(), game = store.game, now = new Date().toISOString()
    advanceGame(game, 200_500_000, 'fast', now, () => .5); store.set('game-v2', game)
    store.updateSettings({ theme: 'light' }); store.act({ type: 'ball', petId: game.activeId, ball: 'premier' })
    const firstId = game.activeId
    store.act({ type: 'egg', eggType: 'fire' })
    const second = store.game
    advanceGame(second, 500_000, 'fast', now, () => .5); store.set('game-v2', second)
    store.act({ type: 'ball', petId: second.activeId, ball: 'great' })
    store.act({ type: 'candy', count: 500 })
    expect(store.game.pets.find(p => p.id === firstId)?.ball).toBe('premier')
    expect(activePet(store.game).ball).toBe('great')
    expect(activePet(store.game).phase).toBe(2)
  })
  it('counts distinct ghost species across normal/shiny dexes and permanently records collection rewards', () => {
    const game = newGame(), rewards: RewardState = { unlocked: {} }
    game.owned = [92, 93]; game.ownedShiny = [92]
    unlockRewards(game, rewards, 'first')
    expect(ballUnlocked(rewards, 'luxury')).toBe(true); expect(ballUnlocked(rewards, 'dusk')).toBe(false)
    game.ownedShiny.push(94); unlockRewards(game, rewards, 'second')
    expect(rewards.unlocked.dusk).toBe('second')
    game.owned = POKEMON.map(p => p.id); unlockRewards(game, rewards, 'complete')
    expect(rewards.unlocked.master).toBe('complete')
    game.owned = []; game.ownedShiny = []; expect(unlockRewards(game, rewards, 'later')).toEqual([])
    expect(themeUnlocked(rewards, 'master')).toBe(true); expect(themeUnlocked({ unlocked: {} }, 'dark')).toBe(true)
  })
  it('rolls back new rewards with a failed growth transaction', () => {
    const { store } = setup(), event = record('failed', 50_000_000)
    expect(() => store.sync([event], new Set(), linked([event]), () => { throw new Error('failure') })).toThrow('failure')
    expect(store.rewards.unlocked).toEqual({}); expect(store.game.tokensEarned).toBe(0)
    expect(store.snapshot().usage.codex.all).toBe(0)
  })
})
