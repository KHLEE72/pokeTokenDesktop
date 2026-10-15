import Database from 'better-sqlite3'
import { isLanguage } from '../shared/i18n'
import { isDexSort } from '../shared/dex'
import { GameAction, GameState, Settings, Snapshot, UsageRecord, defaultSettings, newGame, totalTokens } from '../shared/model'
import { advanceGame, changePace, gameAction, LegacyGame, migrateGame, upgradeGrowthPaths } from '../shared/game'
import { ParsedFile } from './parsers'
import { scanRoots } from './paths'
import { ballUnlocked, isBall, isTheme, RewardState, themeUnlocked, unlockRewards } from '../shared/rewards'
import { activePet } from '../shared/game'

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
    else if (!settings.theme || !isLanguage(settings.language) || !isDexSort(settings.dexSort)) this.set('settings', { ...settings, theme: settings.theme || 'light', language: isLanguage(settings.language) ? settings.language : 'en', dexSort: isDexSort(settings.dexSort) ? settings.dexSort : 'number' })
    this.db.transaction(() => { this.reconcileRewards(this.game) })()
  }
  get<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
    return row ? JSON.parse(row.value) as T : null
  }
  set(key: string, value: unknown): void { this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?, ?)').run(key, JSON.stringify(value)) }
  get game(): GameState { return this.get<GameState>('game-v2')! }
  get rewards(): RewardState { return this.get<RewardState>('achievements-v1') ?? { unlocked: {} } }
  private reconcileRewards(game: GameState): void {
    const rewards = this.rewards
    unlockRewards(game, rewards, new Date().toISOString())
    this.set('achievements-v1', rewards)
  }
  act(action: GameAction): void {
    this.db.transaction(() => {
      const game = this.game
      this.reconcileRewards(game)
      if (action.type === 'ball') {
        const pet = game.pets.find(p => p.id === action.petId)
        if (!pet || pet.phase === 0 || !isBall(action.ball) || !ballUnlocked(this.rewards, action.ball)) throw new Error('선택할 수 없는 볼입니다. 업적에서 획득 조건을 확인해주세요.')
      }
      const notice = gameAction(game,action,this.settings.pace,new Date().toISOString())
      this.reconcileRewards(game)
      if (activePet(game).phase === 0 && this.settings.inBall) this.set('settings', { ...this.settings, inBall: false })
      this.set('game-v2',game); this.set('notice',notice)
    })()
  }
  get settings(): Settings { return this.get<Settings>('settings')! }
  updateSettings(patch: Partial<Settings>): void {
    this.db.transaction(() => {
      const settings = this.settings, game = this.game
      if (patch.language !== undefined && !isLanguage(patch.language)) throw new Error('잘못된 언어 설정입니다.')
      if (patch.dexSort !== undefined && !isDexSort(patch.dexSort)) throw new Error('잘못된 도감 정렬입니다.')
      this.reconcileRewards(game)
      if (patch.theme !== undefined && (!isTheme(patch.theme) || !themeUnlocked(this.rewards, patch.theme))) throw new Error('아직 얻지 못한 테마예요. 업적에서 획득 조건을 확인해주세요.')
      if (patch.inBall !== undefined && typeof patch.inBall !== 'boolean') throw new Error('잘못된 볼 상태입니다.')
      if (patch.inBall && activePet(game).phase === 0) throw new Error('알이 부화하면 볼에 넣을 수 있어요.')
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
      this.reconcileRewards(game)
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
    return { game: this.game, settings: this.settings, rewards: this.rewards, usage, roots: [], scanning: false, lastScan: this.get<string>('lastScan'), notice: this.get<string>('notice') }
  }
  close(): void { this.db.close() }
}
