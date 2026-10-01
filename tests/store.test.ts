import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/main/store'
import { UsageRecord } from '../src/shared/model'
import { removeTestDirectory } from './temp'
const stores: Store[] = [], dirs: string[] = []
const make = (): { path: string; store: Store } => {
  const dir = mkdtempSync(join(tmpdir(), 'poketoken-store-')); dirs.push(dir)
  const path = join(dir, 'test.sqlite'), store = new Store(path); stores.push(store); return { path, store }
}
afterEach(() => { for (const store of stores.splice(0)) if (store.db.open) store.close(); for (const dir of dirs.splice(0)) removeTestDirectory(dir) })
const record = (id: string, input: number): UsageRecord => ({ id, provider: 'claude', timestamp: new Date().toISOString(), input, output: 0, cacheRead: 0, cacheWrite: 0 })
const linked = (records: UsageRecord[]) => new Map(records.map(r=>[r.id,'2000-01-01T00:00:00.000Z']))
describe('atomic usage ledger', () => {
  it('baselines history, counts only increases, and survives restart', () => {
    const { path, store } = make(), old = record('old',100)
    store.sync([old],new Set(['old']),linked([old]))
    expect(store.game.tokensEarned).toBe(0)
    const updated = record('old',150), added = record('new',500_000)
    store.sync([updated,added],new Set(),linked([updated,added]))
    expect(store.game.tokensEarned).toBe(500_050); expect(store.game.phase).toBe(1)
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
    const {store}=make(), game=store.game; game.xp=250_000; store.set('game',game)
    store.updateSettings({pace:'slow',size:192})
    expect(store.game.xp).toBe(5_000_000); expect(store.settings.size).toBe(192)
  })
})
