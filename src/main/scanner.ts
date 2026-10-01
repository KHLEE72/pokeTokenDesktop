import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { RootStatus, UsageRecord } from '../shared/model'
import { dedupClaude, parseFile, resolveCodex, Rollout, stateKey } from './parsers'
import { scanRoots, ScanRoot } from './paths'
import { Store } from './store'

export class Scanner {
  private discovered = new Map<string, string[]>()
  private lastDiscovery = 0
  statuses: RootStatus[] = []
  constructor(private readonly store: Store) {}
  private async walk(path: string, errors: string[]): Promise<string[]> {
    const found: string[] = []
    const stack = [path]
    while (stack.length) {
      const directory = stack.pop()!
      try {
        for (const item of await readdir(directory, { withFileTypes: true })) {
          if (item.isDirectory()) stack.push(join(directory, item.name))
          else if (item.isFile() && item.name.endsWith('.jsonl')) found.push(join(directory, item.name))
        }
      } catch { errors.push(directory) }
    }
    return found
  }
  async scan(force = false): Promise<void> {
    const roots = scanRoots(this.store.settings)
    const discover = force || Date.now() - this.lastDiscovery >= 60_000
    const baseline = new Set<string>(), linkedAt = new Map<string, string>()
    const established = new Set<string>()
    const claude: UsageRecord[] = [], codex = new Map<string, Rollout>(), statuses: RootStatus[] = []
    const pendingReady: string[] = []
    const codexOrigin = new Map<string, { root: ScanRoot; first: boolean; linkedAt: string }[]>()
    for (const root of roots) {
      const rootInfo = this.store.root(root.key)
      const status: RootStatus = { provider: root.provider, path: root.path, state: 'connected', files: 0, skipped: 0 }
      statuses.push(status)
      try { if (!(await stat(root.path)).isDirectory()) { status.state = 'missing'; continue } }
      catch (error) {
        status.state = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'error'
        if (status.state === 'error') status.error = '폴더를 읽을 수 없습니다. 접근 권한과 연결 상태를 확인해주세요.'
        continue
      }
      const errors: string[] = []
      if (discover || !this.discovered.has(root.key)) this.discovered.set(root.key, await this.walk(root.path, errors))
      let complete = errors.length === 0
      for (const path of this.discovered.get(root.key) ?? []) {
        try {
          const info = await stat(path)
          let cache = this.store.cached(path)
          if (!cache || cache.provider !== root.provider || cache.mtime !== info.mtimeMs || cache.size !== info.size) {
            const data = await parseFile(path, root.provider)
            // Retry files still being written; the next scan will see any size/mtime change.
            cache = { path, provider: root.provider, mtime: info.mtimeMs, size: info.size, data }
            this.store.cache(cache)
          }
          status.files++; status.skipped += cache.data.skipped
          if (root.provider === 'claude') {
            claude.push(...cache.data.claude)
            for (const entry of cache.data.claude) {
              if (!rootInfo.ready) baseline.add(entry.id)
              else established.add(entry.id)
              if (!linkedAt.has(entry.id) || rootInfo.linkedAt < linkedAt.get(entry.id)!) linkedAt.set(entry.id, rootInfo.linkedAt)
            }
          } else if (cache.data.codex) {
            codex.set(path, cache.data.codex)
            codexOrigin.set(path, [...(codexOrigin.get(path) ?? []), { root, first: !rootInfo.ready, linkedAt: rootInfo.linkedAt }])
          }
        } catch { complete = false; status.state = 'error'; status.error = '일부 로그를 읽지 못했습니다. 다음 스캔에서 다시 시도합니다.' }
      }
      if (errors.length) { status.state = 'error'; status.error = '일부 하위 폴더를 읽지 못했습니다.' }
      if (complete) pendingReady.push(root.key)
    }
    const codexRecords = resolveCodex([...codex.values()])
    // Associate canonical records with root baselines through their owning session.
    const originsByEvent = new Map<string, { first: boolean; linkedAt: string }[]>()
    const legacyOrigins = new Map<string, { first: boolean; linkedAt: string }[]>()
    for (const rollout of codex.values()) for (const origin of codexOrigin.get(rollout.path) ?? []) {
      for (const event of rollout.events) {
        const owner = rollout.parent ? rollout.session : event.session ?? rollout.session
        if (owner && event.state) {
          const key = `${owner}|${stateKey(event.state)}`
          originsByEvent.set(key, [...(originsByEvent.get(key) ?? []), origin])
        } else legacyOrigins.set(event.entry.id, [...(legacyOrigins.get(event.entry.id) ?? []), origin])
      }
    }
    for (const record of codexRecords) for (const origin of record.id.startsWith('codex|legacy|') ? legacyOrigins.get(record.id) ?? [] : originsByEvent.get(`${record.id.split('|')[1]}|${record.id.split('|')[3]}`) ?? []) {
      if (origin.first) baseline.add(record.id)
      else established.add(record.id)
      if (!linkedAt.has(record.id) || origin.linkedAt < linkedAt.get(record.id)!) linkedAt.set(record.id, origin.linkedAt)
    }
    for (const id of established) baseline.delete(id)
    this.store.db.transaction(() => {
      this.store.sync([...dedupClaude(claude), ...codexRecords], baseline, linkedAt)
      for (const key of pendingReady) this.store.readyRoot(key)
      this.store.set('lastScan', new Date().toISOString())
    })()
    this.statuses = statuses
    if (discover) this.lastDiscovery = Date.now()
  }
}
