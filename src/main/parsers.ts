// Usage normalization and fork resolution adapted from chattymin/PokeTokenBar (MIT).
// See THIRD_PARTY_NOTICES.md for the pinned source and full license.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { basename } from 'node:path'
import { Tokens, UsageRecord, totalTokens } from '../shared/model'

type Raw = Record<string, any>
export interface Vector { input: number; cached: number; write: number; output: number; reasoning: number; total: number }
interface UsageState { cumulative: Vector; last: Vector }
interface CodexEvent { entry: UsageRecord; state: UsageState | null; session: string | null }
export interface Rollout { path: string; session: string | null; parent: string | null; subagent: boolean; events: CodexEvent[] }
export interface ParsedFile { claude: UsageRecord[]; codex: Rollout | null; skipped: number }
export const number = (v: unknown): number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 1e12 ? v : 0
const vector = (r: Raw): Vector => ({ input: number(r.input_tokens), cached: number(r.cached_input_tokens), write: number(r.cache_write_input_tokens), output: number(r.output_tokens), reasoning: number(r.reasoning_output_tokens), total: number(r.total_tokens) })
const fingerprint = (s: UsageState): string => JSON.stringify(s)
const components = (v: Vector): number => Math.max(0, v.input - v.cached) + v.cached + v.output
const hash = (v: string): string => createHash('sha256').update(v).digest('hex')
export const stateKey = (state: UsageState): string => hash(fingerprint(state))
const date = (v: unknown): string | null => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null

// Read complete JSONL records with bounded buffering; never persist conversation text.
export async function* jsonLines(path: string): AsyncGenerator<Raw | null> {
  let pending: Buffer = Buffer.alloc(0), dropping = false
  const limit = 16 * 1024 * 1024
  for await (const chunk of createReadStream(path, { highWaterMark: 256 * 1024 })) {
    const bytes = chunk as Buffer
    const buffer = pending.length ? Buffer.concat([pending, bytes]) : bytes
    let start = 0, end: number
    while ((end = buffer.indexOf(10, start)) !== -1) {
      if (dropping) { dropping = false; yield null }
      else if (end - start > limit) yield null
      else {
        const line = buffer.subarray(start, end).toString('utf8').trim()
        if (line) { try { yield JSON.parse(line) } catch { yield null } }
      }
      start = end + 1
    }
    pending = buffer.subarray(start)
    if (pending.length > limit) { pending = Buffer.alloc(0); dropping = true }
  }
  // A valid final line without newline is supported; incomplete writes are retried on change.
  if (!dropping && pending.length) { try { yield JSON.parse(pending.toString('utf8')) } catch { yield null } }
}
export function parseClaude(r: Raw): UsageRecord | null {
  const timestamp = date(r?.timestamp), usage = r?.message?.usage
  if (r?.type !== 'assistant' || !timestamp || !usage || typeof r.message.id !== 'string') return null
  return { provider: 'claude', id: `claude|${r.message.id}|${typeof r.requestId === 'string' ? r.requestId : ''}`, timestamp,
    input: number(usage.input_tokens), output: number(usage.output_tokens), cacheRead: number(usage.cache_read_input_tokens), cacheWrite: number(usage.cache_creation_input_tokens) }
}
export function dedupClaude(records: UsageRecord[]): UsageRecord[] {
  const byId = new Map<string, UsageRecord>()
  for (const r of records) {
    const before = byId.get(r.id)
    if (!before) byId.set(r.id, r)
    else byId.set(r.id, { ...(totalTokens(r) > totalTokens(before) ? r : before), timestamp: before.timestamp < r.timestamp ? before.timestamp : r.timestamp })
  }
  return [...byId.values()]
}
export async function parseFile(path: string, provider: 'claude' | 'codex'): Promise<ParsedFile> {
  const claude: UsageRecord[] = []
  const rollout: Rollout = { path, session: null, parent: null, subagent: false, events: [] }
  let current: string | null = null, previous: string | null = null, turn = 0, skipped = 0
  for await (const r of jsonLines(path)) {
    if (!r || typeof r !== 'object') { skipped++; continue }
    if (provider === 'claude') { const e = parseClaude(r); if (e) claude.push(e); continue }
    if (r.type === 'session_meta' && r.payload) {
      const p = r.payload
      const id = typeof p.id === 'string' ? p.id : typeof p.session_id === 'string' ? p.session_id : null
      if (!rollout.session && id) {
        rollout.session = id
        rollout.parent = typeof p.forked_from_id === 'string' ? p.forked_from_id : typeof p.parent_thread_id === 'string' ? p.parent_thread_id : null
        rollout.subagent = p.thread_source === 'subagent' || Boolean(p.source?.subagent)
      }
      if (id && id !== current) { current = id; previous = null }
    }
    const info = r.payload?.info, timestamp = date(r.timestamp)
    if (r.type !== 'event_msg' || r.payload?.type !== 'token_count' || !info?.last_token_usage || !timestamp) continue
    const last = vector(info.last_token_usage), cumulative = info.total_token_usage ? vector(info.total_token_usage) : null
    const state = cumulative ? { cumulative, last } : null
    const signature = state && current ? `${current}|${fingerprint(state)}` : null
    const position = turn++
    if (signature && signature === previous) continue
    previous = signature
    const trust = !cumulative || (components(cumulative) === 0 && cumulative.total > 0) || last.total === cumulative.total
    const totalOnly = components(last) === 0 && last.total > 0 && trust
    rollout.events.push({ session: current, state, entry: { provider: 'codex', id: `codex|legacy|${basename(path)}|${position}`, timestamp,
      input: totalOnly ? last.total : Math.max(0, last.input - last.cached), output: totalOnly ? 0 : last.output,
      cacheRead: totalOnly ? 0 : last.cached, cacheWrite: 0 } })
  }
  return { claude: dedupClaude(claude), codex: provider === 'codex' ? rollout : null, skipped }
}

export function resolveCodex(rollouts: Rollout[]): UsageRecord[] {
  type Resolved = { history: CodexEvent[]; owned: UsageRecord[] }
  const sessions = new Map<string, Rollout[]>()
  for (const r of rollouts) if (r.session) sessions.set(r.session, [...(sessions.get(r.session) ?? []), r])
  const memo = new Map<string, Resolved>()
  const fallback = (r: Rollout): number => {
    if (r.subagent) return 0
    let n = r.events.length ? 1 : 0
    while (n < r.events.length && Date.parse(r.events[n].entry.timestamp) - Date.parse(r.events[n - 1].entry.timestamp) < 1000) n++
    return n
  }
  function own(r: Rollout, skip: number, inherited: CodexEvent[] = []): Resolved {
    const history = [...inherited], owned: UsageRecord[] = []
    let epoch = 0, previous: Vector | null = null, ownerBefore: string | null = null
    for (const e of r.events.slice(skip)) {
      const owner = r.parent ? r.session : e.session ?? r.session
      if (owner !== ownerBefore) { epoch = 0; previous = null; ownerBefore = owner }
      const prior = previous, cum = e.state?.cumulative
      if (cum && previous && (['input', 'cached', 'write', 'output', 'reasoning', 'total'] as const).some(k => cum[k] < previous![k])) epoch++
      previous = cum ?? null
      let entry = { ...e.entry }
      if (owner && e.state) {
        if (totalTokens(entry) === 0 && e.state.last.total > 0 && prior && cum!.total > prior.total) entry.input = e.state.last.total
        entry.id = `codex|${owner}|${epoch}|${stateKey(e.state)}`
      }
      owned.push(entry)
      history.push({ ...e, entry })
    }
    return { history, owned }
  }
  function resolve(r: Rollout, visiting = new Set<string>()): Resolved {
    if (memo.has(r.path)) return memo.get(r.path)!
    if (visiting.has(r.path)) return own(r, r.parent ? fallback(r) : 0)
    visiting.add(r.path)
    let match = 0, inherited: CodexEvent[] = []
    if (r.parent) for (const parent of sessions.get(r.parent) ?? []) {
      if (parent.path === r.path) continue
      const history = resolve(parent, visiting).history
      let n = 0, comparable = true
      while (n < r.events.length && n < history.length) {
        if (!r.events[n].state || !history[n].state) { comparable = false; break }
        if (fingerprint(r.events[n].state!) !== fingerprint(history[n].state!)) break
        n++
      }
      if (comparable && n > match) { match = n; inherited = history.slice(0, n) }
    }
    const resolved = own(r, match || (r.parent ? fallback(r) : 0), inherited)
    visiting.delete(r.path)
    memo.set(r.path, resolved)
    return resolved
  }
  const records = new Map<string, UsageRecord>()
  for (const rollout of [...rollouts].sort((a, b) => a.path.localeCompare(b.path))) for (const e of resolve(rollout).owned) {
    const before = records.get(e.id)
    if (!before || e.timestamp < before.timestamp) records.set(e.id, e)
  }
  return [...records.values()]
}
