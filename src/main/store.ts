import Database from 'better-sqlite3'
import { GameAction, GameState, Settings, Snapshot, UsageRecord, defaultSettings, newGame, totalTokens } from '../shared/model'
import { advanceGame, changePace, gameAction, LegacyGame, migrateGame, upgradeGrowthPaths } from '../shared/game'
import { ParsedFile } from './parsers'
import { scanRoots } from './paths'

export interface CachedFile { path: string; provider: string; mtime: number; size: number; data: ParsedFile }
export class Store {
  readonly db: Database.Database
  constructor(path: string) {
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = FULL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY, provider TEXT NOT NULL, timestamp TEXT NOT NULL,
        input INTEGER NOT NULL, output INTEGER NOT NULL, cacheRead INTEGER NOT NULL, cacheWrite INTEGER NOT NULL, credited INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS usage_time ON usage(timestamp);
      CREATE TABLE IF NOT EXISTS roots (key TEXT PRIMARY KEY, linkedAt TEXT NOT NULL, ready INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, provider TEXT NOT NULL, mtime REAL NOT NULL, size INTEGER NOT NULL, data TEXT NOT NULL);
      PRAGMA user_version = 1;
    `)
    // Keep the original v1 game untouched as a recovery copy. Migration runs
    // once; the usage ledger/high-water marks are shared without recrediting.
    if (!this.get('game-v2')) this.db.transaction(() => {
      const legacy = this.get<LegacyGame>('game')
      this.set('game-v2', legacy ? migrateGame(legacy,new Date().toISOString()) : newGame())
    })()
    const game=this.game
    if (game.pets.some(p=>!p.path || p.evolutionTarget===undefined) || game.captures.some(c=>!c.speciesId)) this.db.transaction(()=>{
      if (!this.get('game-before-branches')) this.set('game-before-branches',game)
      upgradeGrowthPaths(game);this.set('game-v2',game)
    })()
    const settings = this.get<Settings>('settings')
    if (!settings) this.set('settings', defaultSettings())
    else if (!settings.theme) this.set('settings', { ...settings, theme: 'light' })
  }
  get<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
    return row ? JSON.parse(row.value) as T : null
  }
  set(key: string, value: unknown): void { this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?, ?)').run(key, JSON.stringify(value)) }
  get game(): GameState { return this.get<GameState>('game-v2')! }
  act(action: GameAction): void {
    this.db.transaction(() => {
      const game = this.game, notice = gameAction(game,action,this.settings.pace,new Date().toISOString())
      this.set('game-v2',game); this.set('notice',notice)
    })()
  }
  get settings(): Settings { return this.get<Settings>('settings')! }
  updateSettings(patch: Partial<Settings>): void {
    this.db.transaction(() => {
      const settings = this.settings, game = this.game
      if (patch.pace && patch.pace !== settings.pace) changePace(game, settings.pace, patch.pace)
      if (patch.roots) {
        const before = new Set(scanRoots(settings).map(r => r.key))
        for (const root of scanRoots({ ...settings, ...patch })) if (!before.has(root.key)) {
          // Reconnecting an explicitly removed source establishes a fresh baseline.
          this.db.prepare('DELETE FROM roots WHERE key = ?').run(root.key)
        }
      }
      this.set('settings', { ...settings, ...patch })
      this.set('game-v2', game)
    })()
  }
  root(key: string): { linkedAt: string; ready: number } {
    this.db.prepare('INSERT OR IGNORE INTO roots (key, linkedAt) VALUES (?, ?)').run(key, new Date().toISOString())
    return this.db.prepare('SELECT linkedAt, ready FROM roots WHERE key = ?').get(key) as { linkedAt: string; ready: number }
  }
  readyRoot(key: string): void { this.db.prepare('UPDATE roots SET ready = 1 WHERE key = ?').run(key) }
  cached(path: string): CachedFile | null {
    const row = this.db.prepare('SELECT * FROM files WHERE path = ?').get(path) as (Omit<CachedFile, 'data'> & { data: string }) | undefined
    return row ? { ...row, data: JSON.parse(row.data) } : null
  }
  cache(file: CachedFile): void {
    this.db.prepare('INSERT OR REPLACE INTO files VALUES (?, ?, ?, ?, ?)').run(file.path, file.provider, file.mtime, file.size, JSON.stringify(file.data))
  }
  // Event high-water marks and game changes commit together, including first-connection baselines.
  sync(records: UsageRecord[], baseline: Set<string>, linkedAt: Map<string, string>, random = Math.random): string | null {
    return this.db.transaction(() => {
      const game = this.game, settings = this.settings
      const get = this.db.prepare('SELECT credited FROM usage WHERE id = ?')
      const put = this.db.prepare(`INSERT INTO usage VALUES (@id, @provider, @timestamp, @input, @output, @cacheRead, @cacheWrite, @credited)
        ON CONFLICT(id) DO UPDATE SET timestamp=MIN(usage.timestamp,excluded.timestamp), input=excluded.input, output=excluded.output,
          cacheRead=excluded.cacheRead, cacheWrite=excluded.cacheWrite, credited=MAX(usage.credited,excluded.credited)`)
      let earned = 0
      for (const record of records) {
        const prior = get.get(record.id) as { credited: number } | undefined
        const total = totalTokens(record)
        const historical = !prior && record.timestamp < (linkedAt.get(record.id) ?? '9999')
        if (!baseline.has(record.id) && !historical) earned += Math.max(0, total - (prior?.credited ?? 0))
        put.run({ ...record, credited: total })
      }
      const notice = advanceGame(game, earned, settings.pace, new Date().toISOString(), random)
      this.set('game-v2', game)
      if (notice) this.set('notice', notice)
      return notice
    })()
  }
  snapshot(): Snapshot {
    const usage = { claude: { today: 0, all: 0 }, codex: { today: 0, all: 0 } }
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 1)
    const rows = this.db.prepare(`SELECT provider, SUM(input+output+cacheRead+cacheWrite) AS total,
      SUM(CASE WHEN timestamp >= ? AND timestamp < ? THEN input+output+cacheRead+cacheWrite ELSE 0 END) AS today
      FROM usage GROUP BY provider`).all(start.toISOString(), end.toISOString()) as { provider: 'claude' | 'codex'; total: number; today: number }[]
    for (const row of rows) usage[row.provider] = { all: row.total ?? 0, today: row.today ?? 0 }
    return { game: this.game, settings: this.settings, usage, roots: [], scanning: false, lastScan: this.get<string>('lastScan'), notice: this.get<string>('notice') }
  }
  close(): void { this.db.close() }
}
