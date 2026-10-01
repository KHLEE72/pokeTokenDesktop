// Growth balance adapted from PokeTokenBar (MIT), pinned revision in THIRD_PARTY_NOTICES.md.
import { GameState, Pace } from './model'
export const multipliers: Record<Pace, number> = { fast: 0.1, normal: 1, slow: 2 }
const baseThresholds = [5_000_000, 500_000_000, 1_000_000_000, 1_500_000_000]
export const threshold = (phase: number, pace: Pace): number => Math.round(baseThresholds[phase] * multipliers[pace])
export const speciesId = (game: GameState): number | null => game.family === null ? null : game.family * 3 + game.phase
export function changePace(game: GameState, before: Pace, after: Pace): void {
  game.xp = Math.min(threshold(game.phase, after) - 1, Math.floor(game.xp / threshold(game.phase, before) * threshold(game.phase, after)))
}
export function advanceGame(game: GameState, tokens: number, pace: Pace, now: string, random = Math.random): string | null {
  if (!Number.isSafeInteger(tokens) || tokens <= 0) return null
  game.tokensEarned += tokens
  game.xp += tokens
  let hatches = 0, evolutions = 0, completions = 0
  while (game.xp >= threshold(game.phase, pace)) {
    game.xp -= threshold(game.phase, pace)
    if (game.phase === 0) {
      const completed = new Set(game.captures.map(c => c.family))
      const unfinished = [0, 1, 2].filter(f => !completed.has(f))
      const choices = unfinished.length ? unfinished : [0, 1, 2]
      game.family = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]
      game.phase = 1
      hatches++
    } else if (game.phase < 3) {
      game.phase++
      evolutions++
    } else {
      game.captures.push({ family: game.family!, completedAt: now })
      game.family = null
      game.phase = 0
      completions++
    }
    const id = speciesId(game)
    if (id && !game.owned.includes(id)) game.owned.push(id)
  }
  return hatches + evolutions + completions ? [hatches ? `부화 ${hatches}회` : '', evolutions ? `진화 ${evolutions}회` : '', completions ? `성장 완료 ${completions}회` : ''].filter(Boolean).join(' · ') : null
}
