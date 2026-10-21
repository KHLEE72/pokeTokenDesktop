export type Provider = 'claude' | 'codex'
export type Pace = 'fast' | 'normal' | 'slow'
import type { BallId, RewardState, ThemeId } from './rewards'
import type { Language } from './i18n'
import type { DexSort } from './dex'
import type { LeagueDisplay, LeagueState } from './league'
import type { UpdateAction, UpdateState } from './updates'
export interface Tokens { input: number; output: number; cacheRead: number; cacheWrite: number }
export interface UsageRecord extends Tokens { id: string; provider: Provider; timestamp: string }
export const totalTokens = (v: Tokens): number => v.input + v.output + v.cacheRead + v.cacheWrite
export const emptyTokens = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
import { EggType } from './catalog'
export { POKEMON, EGG_TYPES, FAMILIES, EVOLUTIONS } from './catalog'
export type { EggType } from './catalog'
export interface Capture { family: number; completedAt: string; petId: string; shiny: boolean; speciesId?: number }
export interface Companion {
  id: string; family: number | null; phase: number; xp: number; shiny: boolean
  eggType: EggType | null; obtainedAt: string | null
  // Optional on older v2 saves; backfilled once without recrediting usage.
  path?: number[]; evolutionTarget?: number | null
  ball?: BallId
  mega?: number | null
}
export const CANDY_XP = 100_000
export interface AppearanceCollection { owned: number[]; ownedShiny: number[]; megaStones: string[]; freeMegaStoneUsed: boolean }
export const newAppearanceCollection = ():AppearanceCollection => ({owned:[],ownedShiny:[],megaStones:[],freeMegaStoneUsed:false})
export interface GameState {
  version: 2; tokensEarned: number; candyTokens: number; nextId: number
  pets: Companion[]; activeId: string; displayPhase: number
  owned: number[]; ownedShiny: number[]; captures: Capture[]
  appearances?: AppearanceCollection
}
export type GameAction = { type: 'egg'; eggType: EggType } | { type: 'select'; petId: string; phase: number } | { type: 'candy'; count: number } | { type: 'target'; speciesId: number | null } | { type: 'ball'; petId: string; ball: BallId } | {type:'mega-stone';stone:string} | {type:'mega';formId:number|null;petId?:string}
export interface Settings {
  language: Language
  dexSort: DexSort
  pace: Pace; size: 96 | 128 | 192; displayId: string | null; visible: boolean
  paused: boolean; autoStart: boolean; theme: ThemeId; inBall?: boolean; roots: Record<Provider, string[]>
}
export const defaultSettings = (): Settings => ({ language: 'en', dexSort: 'number', pace: 'fast', size: 128, displayId: null, visible: true, paused: false, autoStart: false, theme: 'light', inBall: false, roots: { claude: [], codex: [] } })
export const newGame = (): GameState => ({ version: 2, tokensEarned: 0, candyTokens: 0, nextId: 2,
  pets: [{ id: 'pet:1', phase: 0, family: null, xp: 0, shiny: false, eggType: 'grass', obtainedAt: null, path: [], evolutionTarget: null }],
  activeId: 'pet:1', displayPhase: 0, owned: [], ownedShiny: [], captures: [], appearances:newAppearanceCollection() })
export interface RootStatus {
  provider: Provider; path: string; state: 'connected' | 'missing' | 'error'
  files: number; skipped: number; error?: string
}
export interface Snapshot {
  game: GameState; settings: Settings; usage: Record<Provider, { today: number; all: number }>
  roots: RootStatus[]; scanning: boolean; lastScan: string | null; notice: string | null
  rewards: RewardState
  league?: LeagueState
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
  setLeagueDisplay(display: LeagueDisplay): Promise<void>
  getUpdateState(): Promise<UpdateState>
  updateAction(action: UpdateAction): Promise<void>
  onUpdateState(callback: (state: UpdateState) => void): () => void
  openLeagueSource(goalId: string, partyIndex: number): Promise<void>
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
