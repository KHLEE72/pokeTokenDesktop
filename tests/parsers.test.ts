import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { dedupClaude, parseClaude, parseFile, resolveCodex } from '../src/main/parsers'
import { totalTokens } from '../src/shared/model'
import { removeTestDirectory } from './temp'
const dirs: string[] = []
const temp = (): string => { const dir = mkdtempSync(join(tmpdir(), 'poketoken-test-')); dirs.push(dir); return dir }
afterEach(() => { for (const dir of dirs.splice(0)) removeTestDirectory(dir) })
const t = '2026-10-01T01:00:00.000Z'
const meta = (id: string, parent?: string, subagent = false) => ({ type: 'session_meta', timestamp: t, payload: { id, forked_from_id: parent, thread_source: subagent ? 'subagent' : 'user' } })
const v = (input: number, output = 10, cached = 0) => ({ input_tokens: input, output_tokens: output, cached_input_tokens: cached, reasoning_output_tokens: 5, total_tokens: input + output })
const event = (last: object, cumulative: object | undefined, timestamp = t) => ({ type: 'event_msg', timestamp, payload: { type: 'token_count', info: { last_token_usage: last, total_token_usage: cumulative } } })
async function rollout(records: unknown[], file = 'test.jsonl') {
  const path = join(temp(), file); writeFileSync(path, records.map(r => JSON.stringify(r)).join('\n') + '\n')
  return (await parseFile(path, 'codex')).codex!
}
describe('Claude', () => {
  it('normalizes all four buckets and keeps the largest streamed usage and earliest timestamp', () => {
    const make = (output: number, timestamp = t) => parseClaude({ type: 'assistant', timestamp, requestId: 'request', message: { id: 'msg', usage: { input_tokens: 20, output_tokens: output, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 } } })!
    const records = dedupClaude([make(1), make(10, '2026-10-02T00:00:00Z'), make(3)])
    expect(records).toHaveLength(1); expect(totalTokens(records[0])).toBe(100); expect(records[0].timestamp).toBe(t)
  })
  it('rejects missing identifiers and sanitizes malformed token numbers', () => {
    expect(parseClaude({ type: 'assistant', timestamp: t, message: { usage: {} } })).toBeNull()
    const entry = parseClaude({ type: 'assistant', timestamp: t, message: { id: 'x', usage: { input_tokens: 1e30, output_tokens: -1, cache_read_input_tokens: '10' } } })!
    expect(totalTokens(entry)).toBe(0)
  })
  it('recovers after a partial final line becomes complete', async () => {
    const path = join(temp(), 'test.jsonl')
    const line = JSON.stringify({ type: 'assistant', timestamp: t, message: { id: 'x', usage: { input_tokens: 12 } } })
    writeFileSync(path, '{invalid}\n' + line.slice(0, -1))
    expect((await parseFile(path, 'claude')).claude).toEqual([])
    writeFileSync(path, '{invalid}\n' + line)
    expect((await parseFile(path, 'claude')).claude[0].input).toBe(12)
  })
})
describe('Codex', () => {
  it('counts cache and reasoning only once and removes repeated snapshots', async () => {
    const e = event(v(100, 20, 40), v(100, 20, 40))
    const entries = resolveCodex([await rollout([meta('root'), e, e])])
    expect(entries).toHaveLength(1); expect(totalTokens(entries[0])).toBe(120); expect(entries[0].input).toBe(60)
  })
  it('preserves two turns with identical deltas but different cumulative states', async () => {
    const entries = resolveCodex([await rollout([meta('root'), event(v(100), v(100)), event(v(100), v(200, 20))])])
    expect(entries.map(totalTokens)).toEqual([110, 110])
  })
  it('handles total-only usage and avoids counting zero-context replay totals', async () => {
    const zero = { input_tokens: 0, output_tokens: 0, total_tokens: 110 }
    const entries = resolveCodex([await rollout([meta('root'), event(zero, { total_tokens: 110 }), event({ total_tokens: 20 }, { total_tokens: 130 })])])
    expect(entries.map(totalTokens)).toEqual([110,20])
    const replay = resolveCodex([await rollout([meta('other'), event(zero, v(500))])])
    expect(replay[0].input).toBe(0)
  })
  it('removes a copied parent prefix and keeps sibling forks distinct', async () => {
    const e = event(v(100), v(100))
    const parent = await rollout([meta('root'), e])
    const children = await Promise.all(['left','right'].map(id => rollout([meta(id, 'root'), meta('root'), e, event(v(200), v(300,20), '2026-10-01T01:00:10Z')])))
    const entries = resolveCodex([parent, ...children])
    expect(entries.map(totalTokens).sort()).toEqual([110,210,210]); expect(new Set(entries.map(e=>e.id)).size).toBe(3)
  })
  it('keeps a subagent first real turn when its parent is absent', async () => {
    const entries = resolveCodex([await rollout([meta('agent','absent',true), event(v(100),v(100))])])
    expect(entries.map(totalTokens)).toEqual([110])
  })
  it('deduplicates renamed or archived copies by session and usage state', async () => {
    const lines = [meta('root'),event(v(100),v(100))]
    const entries = resolveCodex([await rollout(lines,'a.jsonl'),await rollout(lines,'b.jsonl')])
    expect(entries).toHaveLength(1)
  })
  it('matches pinned upstream real fork fixtures', async () => {
    const root = resolve('tests/fixtures/upstream/CodexFork')
    const files = await Promise.all(['parent','child','sibling'].map(async n => (await parseFile(join(root,`${n}.jsonl`),'codex')).codex!))
    const entries = resolveCodex(files)
    expect(entries.reduce((sum, e) => sum + totalTokens(e), 0)).toBe(369_215)
    expect(entries.map(totalTokens).filter(n => n === 28_138 || n === 28_263).sort()).toEqual([28_138,28_263])
    expect(new Set(entries.map(e=>e.id)).size).toBe(entries.length)
    expect(entries.every(e => Number.isSafeInteger(totalTokens(e)))).toBe(true)
  })
  it.each(['child','child-v145'])('keeps upstream %s subagent usage with and without parent', async name => {
    const root = resolve('tests/fixtures/upstream/CodexSubagent')
    const child = (await parseFile(join(root,`${name}.jsonl`),'codex')).codex!
    const parent = (await parseFile(join(root,`${name.replace('child','parent')}.jsonl`),'codex')).codex!
    const alone = resolveCodex([child]), together = resolveCodex([parent,child]).filter(e=>e.id.startsWith(`codex|${child.session}|`))
    expect(alone.map(totalTokens)).toEqual(together.map(totalTokens)); expect(alone.length).toBeGreaterThan(0)
    expect(alone.map(totalTokens)).toEqual(name === 'child' ? [23_062,23_291] : [21_458,21_722])
    expect(resolveCodex([parent,child]).reduce((n,e)=>n+totalTokens(e),0)).toBe(name === 'child' ? 115_607 : 106_583)
  })
})
