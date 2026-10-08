export type Provider = 'claude' | 'codex'
export type Pace = 'fast' | 'normal' | 'slow'
export interface Tokens { input: number; output: number; cacheRead: number; cacheWrite: number }
export interface UsageRecord extends Tokens { id: string; provider: Provider; timestamp: string }
export const totalTokens = (v: Tokens): number => v.input + v.output + v.cacheRead + v.cacheWrite
export const emptyTokens = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
import { EggType } from './catalog'
export { POKEMON, EGG_TYPES, FAMILIES } from './catalog'
export type { EggType } from './catalog'
export interface Capture { family: number; completedAt: string; petId: string; shiny: boolean }
export interface Companion {
  id: string; family: number | null; phase: number; xp: number; shiny: boolean
  eggType: EggType | null; obtainedAt: string | null
}
export interface GameState {
  version: 2; tokensEarned: number; candyTokens: number; nextId: number
  pets: Companion[]; activeId: string; displayPhase: number
  owned: number[]; ownedShiny: number[]; captures: Capture[]
}
export type GameAction = { type: 'egg'; eggType: EggType } | { type: 'select'; petId: string; phase: number } | { type: 'candy'; count: number }
export interface Settings {
  pace: Pace; size: 96 | 128 | 192; displayId: string | null; visible: boolean
  paused: boolean; autoStart: boolean; theme: 'light' | 'dark'; roots: Record<Provider, string[]>
}
export const defaultSettings = (): Settings => ({ pace: 'fast', size: 128, displayId: null, visible: true, paused: false, autoStart: false, theme: 'light', roots: { claude: [], codex: [] } })
export const newGame = (): GameState => ({ version: 2, tokensEarned: 0, candyTokens: 0, nextId: 2,
  pets: [{ id: 'pet:1', phase: 0, family: null, xp: 0, shiny: false, eggType: 'grass', obtainedAt: null }],
  activeId: 'pet:1', displayPhase: 0, owned: [], ownedShiny: [], captures: [] })
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
export interface PetMotion { direction: 1 | -1; state: PetMotionState; tilt: number; impact: number; surfaceId?: string | null }
export const PET_TRACE_EVENTS = ['ready','heartbeat','pointerdown','pointerup','pointercancel','gotpointercapture','lostpointercapture','mousedown','mouseup','click','contextmenu','handler.down','handler.up','handler.cancel','capture.failed','capture.release-failed','reset','runtime.error','runtime.rejection','dragstart','stale.press'] as const
export interface PetInputTrace {
  event: typeof PET_TRACE_EVENTS[number]
  pointerId?: number; button?: number; buttons?: number; x?: number; y?: number
  width?: number; height?: number; dpr?: number; line?: number; column?: number
  onCharacter?: boolean; captured?: boolean; pressed?: boolean; trusted?: boolean; visible?: boolean; focused?: boolean
  motion?: PetMotionState; error?: 'NotFoundError' | 'InvalidStateError' | 'Other'
}
export interface DesktopAPI {
  getSnapshot(): Promise<Snapshot>
  onSnapshot(callback: (value: Snapshot) => void): () => void
  updateSettings(patch: Partial<Settings>): Promise<void>
  refresh(): Promise<void>
  chooseFolder(provider: Provider): Promise<string | null>
  getDisplays(): Promise<DisplayChoice[]>
  getSprite(id: number, shiny?: boolean): Promise<string | null>
  gameAction(action: GameAction): Promise<void>
  openDashboard(tab?: string): Promise<void>
  onNavigate(callback: (tab: string) => void): () => void
  onMotion(callback: (motion: PetMotion) => void): () => void
  onInteractionReset(callback: () => void): () => void
  onPetting(callback: () => void): () => void
  pointer(active: boolean): void
  drag(action: 'start' | 'move' | 'end' | 'cancel' | 'release'): void
  petMenu(): void
  tracePetInput(trace: PetInputTrace): void
}
declare global { interface Window { desktop: DesktopAPI } }
