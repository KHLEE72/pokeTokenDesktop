export type Provider = 'claude' | 'codex'
export type Pace = 'fast' | 'normal' | 'slow'
export interface Tokens { input: number; output: number; cacheRead: number; cacheWrite: number }
export interface UsageRecord extends Tokens { id: string; provider: Provider; timestamp: string }
export const totalTokens = (v: Tokens): number => v.input + v.output + v.cacheRead + v.cacheWrite
export const emptyTokens = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
export const POKEMON = [
  { id: 1, name: '이상해씨', family: 0 }, { id: 2, name: '이상해풀', family: 0 }, { id: 3, name: '이상해꽃', family: 0 },
  { id: 4, name: '파이리', family: 1 }, { id: 5, name: '리자드', family: 1 }, { id: 6, name: '리자몽', family: 1 },
  { id: 7, name: '꼬부기', family: 2 }, { id: 8, name: '어니부기', family: 2 }, { id: 9, name: '거북왕', family: 2 }
] as const
export interface Capture { family: number; completedAt: string }
export interface GameState {
  phase: number; family: number | null; xp: number; tokensEarned: number
  owned: number[]; captures: Capture[]
}
export interface Settings {
  pace: Pace; size: 96 | 128 | 192; displayId: string | null; visible: boolean
  paused: boolean; autoStart: boolean; roots: Record<Provider, string[]>
}
export const defaultSettings = (): Settings => ({ pace: 'fast', size: 128, displayId: null, visible: true, paused: false, autoStart: false, roots: { claude: [], codex: [] } })
export const newGame = (): GameState => ({ phase: 0, family: null, xp: 0, tokensEarned: 0, owned: [], captures: [] })
export interface RootStatus {
  provider: Provider; path: string; state: 'connected' | 'missing' | 'error'
  files: number; skipped: number; error?: string
}
export interface Snapshot {
  game: GameState; settings: Settings; usage: Record<Provider, { today: number; all: number }>
  roots: RootStatus[]; scanning: boolean; lastScan: string | null; notice: string | null
}
export interface DisplayChoice { id: string; label: string }
export type PetMotionState = 'idle' | 'walking' | 'held' | 'falling' | 'landing'
export interface PetMotion { direction: 1 | -1; state: PetMotionState; tilt: number; impact: number }
export interface DesktopAPI {
  getSnapshot(): Promise<Snapshot>
  onSnapshot(callback: (value: Snapshot) => void): () => void
  updateSettings(patch: Partial<Settings>): Promise<void>
  refresh(): Promise<void>
  chooseFolder(provider: Provider): Promise<string | null>
  getDisplays(): Promise<DisplayChoice[]>
  getSprite(id: number): Promise<string | null>
  openDashboard(tab?: string): Promise<void>
  onNavigate(callback: (tab: string) => void): () => void
  onMotion(callback: (motion: PetMotion) => void): () => void
  onInteractionReset(callback: () => void): () => void
  pointer(active: boolean): void
  drag(action: 'start' | 'move' | 'end' | 'cancel'): void
  petMenu(): void
}
declare global { interface Window { desktop: DesktopAPI } }
