import { GameState, POKEMON } from './model'
import { Rarity, speciesRarity } from './rarity'

export type BallId = 'poke' | 'great' | 'ultra' | 'premier' | 'luxury' | 'dusk' | 'master' | 'timer' | 'dream' | 'cherish'
export type ThemeId = 'light' | 'dark' | Exclude<BallId, 'poke'>
export interface RewardState { unlocked: Partial<Record<BallId, string>> }
export const BALLS: { id: BallId; name: string; top: string; accent: string; effect: string }[] = [
  { id: 'poke', name: '몬스터볼', top: '#e35d54', accent: '#ffffff', effect: '#ef766d' },
  { id: 'great', name: '슈퍼볼', top: '#4487d3', accent: '#e35d54', effect: '#77b7fb' },
  { id: 'ultra', name: '하이퍼볼', top: '#343746', accent: '#f4cc5a', effect: '#f4cc5a' },
  { id: 'premier', name: '프리미어볼', top: '#fffaf1', accent: '#e35d54', effect: '#f29a99' },
  { id: 'luxury', name: '럭셔리볼', top: '#292934', accent: '#dfb966', effect: '#ebcc84' },
  { id: 'dusk', name: '다크볼', top: '#478060', accent: '#e89349', effect: '#82c9a0' },
  { id: 'master', name: '마스터볼', top: '#9061c3', accent: '#e996c8', effect: '#d1a2f2' },
  { id: 'timer', name: '타이머볼', top: '#f1ede1', accent: '#e5773e', effect: '#ffa767' },
  { id: 'dream', name: '드림볼', top: '#d34eab', accent: '#7d48a1', effect: '#f6a6e5' },
  { id: 'cherish', name: '프레셔스볼', top: '#c42b45', accent: '#2c2834', effect: '#ff8f9f' }
]
export const ballInfo = (id: BallId = 'poke'): typeof BALLS[number] => BALLS.find(ball => ball.id === id) ?? BALLS[0]
export const isBall = (value: unknown): value is BallId => BALLS.some(ball => ball.id === value)
export const THEMES: { id: ThemeId; name: string; ball: BallId | null; colors: [string, string, string]; dark: boolean }[] = [
  { id: 'light', name: '몬스터볼 라이트', ball: 'poke', colors: ['#fffbee', '#d65350', '#76bed9'], dark: false },
  { id: 'dark', name: '보라시티 다크', ball: null, colors: ['#2b223d', '#9670c4', '#ac91e5'], dark: true },
  { id: 'great', name: '슈퍼볼', ball: 'great', colors: ['#eef5ff', '#3575b8', '#d95752'], dark: false },
  { id: 'ultra', name: '하이퍼볼', ball: 'ultra', colors: ['#252b34', '#e5bc49', '#f0ce72'], dark: true },
  { id: 'premier', name: '프리미어볼', ball: 'premier', colors: ['#ffffff', '#c8474f', '#e78a8f'], dark: false },
  { id: 'luxury', name: '럭셔리볼', ball: 'luxury', colors: ['#26232a', '#d3ac63', '#e16e65'], dark: true },
  { id: 'dusk', name: '다크볼', ball: 'dusk', colors: ['#20352c', '#81ba92', '#eca369'], dark: true },
  { id: 'master', name: '마스터볼', ball: 'master', colors: ['#332344', '#d3a0ee', '#eca3cf'], dark: true },
  { id: 'timer', name: '타이머볼', ball: 'timer', colors: ['#f7f0df', '#c96435', '#498e92'], dark: false },
  { id: 'dream', name: '드림볼', ball: 'dream', colors: ['#29203f', '#f19ad6', '#87d6d7'], dark: true },
  { id: 'cherish', name: '프레셔스볼', ball: 'cherish', colors: ['#321b25', '#f57687', '#efd29a'], dark: true }
]
export const isTheme = (value: unknown): value is ThemeId => THEMES.some(theme => theme.id === value)
export const themeInfo = (id: ThemeId): typeof THEMES[number] => THEMES.find(theme => theme.id === id) ?? THEMES[0]
export const ballUnlocked = (rewards: RewardState, ball: BallId): boolean => ball === 'poke' || Boolean(rewards.unlocked[ball])
export const themeUnlocked = (rewards: RewardState, theme: ThemeId): boolean => {
  const ball = themeInfo(theme).ball
  return ball === null || ballUnlocked(rewards, ball)
}
export const rarityDiscoveries = (game:GameState,rarity:Rarity):number => [...new Set([...game.owned,...game.ownedShiny])].filter(id=>speciesRarity(id)===rarity).length
export const ACHIEVEMENTS: { ball: Exclude<BallId, 'poke'>; title: string; description: string; goal: number; unit: string; value: (game: GameState) => number }[] = [
  { ball: 'great', title: '코딩의 첫 발자국', description: '연결 후 새로 사용한 토큰 100만 개를 모으세요.', goal: 1_000_000, unit: '토큰', value: game => game.tokensEarned },
  { ball: 'ultra', title: '차곡차곡 쌓인 시간', description: '연결 후 새로 사용한 토큰 5,000만 개를 모으세요.', goal: 50_000_000, unit: '토큰', value: game => game.tokensEarned },
  { ball: 'premier', title: '첫 최종 진화', description: '포켓몬 한 마리를 최종 진화시키세요.', goal: 1, unit: '마리', value: game => game.captures.length },
  { ball: 'luxury', title: '반짝이는 만남', description: '이로치 포켓몬을 한 종류 이상 발견하세요.', goal: 1, unit: '종', value: game => game.ownedShiny.length },
  { ball: 'dusk', title: '밤의 친구들', description: '고스트 타입 포켓몬 세 종류를 도감에 등록하세요.', goal: 3, unit: '종', value: game => [...new Set([...game.owned, ...game.ownedShiny])].filter(id => POKEMON.find(p => p.id === id)?.types.some(type => type === 'ghost')).length },
  { ball: 'master', title: '우리의 작은 도감', description: '앱의 모든 포켓몬을 일반 또는 이로치 도감에 등록하세요.', goal: POKEMON.length, unit: '종', value: game => POKEMON.filter(p => game.owned.includes(p.id) || game.ownedShiny.includes(p.id)).length },
  { ball: 'timer', title: '오랜 전승의 발자취', description: '준전설 포켓몬 세 종류를 도감에 등록하세요.', goal: 3, unit: '종', value: game => rarityDiscoveries(game,'sublegendary') },
  { ball: 'dream', title: '꿈 너머의 전설', description: '전설 포켓몬 한 종류를 도감에 등록하세요.', goal: 1, unit: '종', value: game => rarityDiscoveries(game,'legendary') },
  { ball: 'cherish', title: '환상이 건넨 초대장', description: '환상의 포켓몬 한 종류를 도감에 등록하세요.', goal: 1, unit: '종', value: game => rarityDiscoveries(game,'mythical') }
]
export function unlockRewards(game: GameState, rewards: RewardState, now: string): BallId[] {
  const added: BallId[] = []
  for (const achievement of ACHIEVEMENTS) if (!ballUnlocked(rewards, achievement.ball) && achievement.value(game) >= achievement.goal) {
    rewards.unlocked[achievement.ball] = now
    added.push(achievement.ball)
  }
  return added
}
