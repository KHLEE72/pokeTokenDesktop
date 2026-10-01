import { describe, expect, it } from 'vitest'
import { advanceGame, changePace, speciesId, threshold } from '../src/shared/game'
import { newGame } from '../src/shared/model'
describe('growth and collection', () => {
  it('hatches at the exact boundary and preserves overflow', () => {
    const game = newGame()
    advanceGame(game, 499_999, 'fast', 'now', () => 0)
    expect(game.phase).toBe(0)
    advanceGame(game, 2, 'fast', 'now', () => 0)
    expect(speciesId(game)).toBe(1); expect(game.xp).toBe(1); expect(game.owned).toEqual([1])
  })
  it('completes all starter families before allowing duplicates', () => {
    const game = newGame()
    const cycle = 300_500_000
    advanceGame(game, cycle * 3, 'fast', '2026-10-01T00:00:00Z', () => 0)
    expect(game.captures.map(c => c.family)).toEqual([0, 1, 2])
    expect([...game.owned].sort((a,b) => a-b)).toEqual([1,2,3,4,5,6,7,8,9])
    expect(game.phase).toBe(0); expect(game.xp).toBe(0)
    advanceGame(game, cycle + 500_050, 'fast', 'now', () => 0)
    expect(game.captures).toHaveLength(4); expect(game.xp).toBe(50); expect(speciesId(game)).toBe(1)
  })
  it('preserves the phase percentage when pace changes', () => {
    const game = newGame(); game.xp = 250_000
    changePace(game, 'fast', 'normal')
    expect(game.xp / threshold(0, 'normal')).toBe(.5); expect(game.phase).toBe(0)
  })
  it('does not grow from invalid or negative usage', () => {
    const game = newGame()
    for (const n of [-1, NaN, Infinity, 1.2]) advanceGame(game, n, 'fast', 'now')
    expect(game).toEqual(newGame())
  })
})
