// Growth balance adapted from PokeTokenBar (MIT), pinned revision in THIRD_PARTY_NOTICES.md.
import { Capture, Companion, EggType, EVOLUTIONS, FAMILIES, GameAction, GameState, newGame, Pace, POKEMON } from './model'
export const multipliers: Record<Pace, number> = { fast: 0.1, normal: 1, slow: 2 }
export const CANDY_XP = 100_000
export const SHINY_CHANCE = 1 / 64
const baseThresholds = [5_000_000, 500_000_000, 1_000_000_000]
export const threshold = (phase: number, pace: Pace): number => Math.round((baseThresholds[phase] ?? 0) * multipliers[pace])
export const activePet = (game: GameState): Companion => game.pets.find(p => p.id === game.activeId)!
export const growthPath = (pet: Companion): readonly number[] => pet.path ?? (pet.family === null ? [] : FAMILIES[pet.family].species.slice(0,pet.phase))
export const evolutionOptions = (pet: Companion): readonly number[] => EVOLUTIONS[growthPath(pet).at(-1) ?? 0] ?? []
const remainingDepth = (id: number): number => {
  const next=EVOLUTIONS[id] ?? []
  return next.length ? 1+Math.max(...next.map(remainingDepth)) : 0
}
export const finalPhase = (pet: Companion): number => pet.phase+remainingDepth(growthPath(pet).at(-1) ?? 0)
export const isGrowing = (game: GameState): boolean => { const pet = activePet(game); return game.displayPhase === pet.phase && (pet.phase === 0 || pet.phase < finalPhase(pet)) }
export const speciesId = (game: GameState): number | null => growthPath(activePet(game))[game.displayPhase-1] ?? null
export const waitingForEvolution = (pet: Companion, pace: Pace): boolean => evolutionOptions(pet).length>1 && !pet.evolutionTarget && pet.xp>=threshold(pet.phase,pace)
export const capturedSpecies = (game: GameState, capture: Capture): number => {
  const pet=game.pets.find(p=>p.id===capture.petId)
  return capture.speciesId ?? (pet ? growthPath(pet).at(-1)! : FAMILIES[capture.family].species.at(-1)!)
}
export function upgradeGrowthPaths(game: GameState): void {
  for (const pet of game.pets) {
    if (!pet.path) pet.path=[...growthPath(pet)]
    if (pet.evolutionTarget===undefined) pet.evolutionTarget=null
  }
  for (const capture of game.captures) if (!capture.speciesId) capture.speciesId=capturedSpecies(game,capture)
}
export const candyCount = (game: GameState): number => Math.floor(game.candyTokens / CANDY_XP)
export const discoveredSpecies = (game: GameState): number[] => [...new Set([...game.owned, ...game.ownedShiny])]
export const eggFamilies = (type: EggType): number[] => FAMILIES.filter(f => f.eggTypes.some(t => t === type)).map(f => f.family)
export const dexChoices = (game: GameState, id: number, shiny: boolean): Companion[] => {
  const species = POKEMON.find(p => p.id === id)
  if (!species) return []
  return game.pets.filter(p => p.family === species.family && p.shiny === shiny && growthPath(p).includes(id))
    .sort((a,b) => Number(b.phase === species.phase)-Number(a.phase === species.phase) || b.xp-a.xp || a.id.localeCompare(b.id))
}
function register(game: GameState, pet: Companion): void {
  const id = growthPath(pet).at(-1)!, owned = pet.shiny ? game.ownedShiny : game.owned
  if (!owned.includes(id)) owned.push(id)
}
function complete(game: GameState, pet: Companion, now: string): void {
  if (!game.captures.some(c => c.petId === pet.id)) game.captures.push({ family: pet.family!, petId: pet.id, shiny: pet.shiny, completedAt: now, speciesId: growthPath(pet).at(-1)! })
}
function grow(game: GameState, xp: number, pace: Pace, now: string, random: () => number): string | null {
  const pet = activePet(game)
  const wasWaiting=waitingForEvolution(pet,pace)
  pet.xp += xp
  let hatch = false, evolves = 0, waiting=false
  while ((pet.phase === 0 || pet.phase < finalPhase(pet)) && pet.xp >= threshold(pet.phase, pace)) {
    const options=evolutionOptions(pet)
    if (pet.phase>0 && options.length>1 && !options.includes(pet.evolutionTarget ?? -1)) {
      game.candyTokens+=pet.xp-threshold(pet.phase,pace)
      pet.xp=threshold(pet.phase,pace);waiting=true;break
    }
    pet.xp -= threshold(pet.phase, pace)
    if (pet.phase === 0) {
      const unfinished = [0,1,2].filter(f=>!game.captures.some(c=>c.family===f))
      const choices = pet.eggType ? eggFamilies(pet.eggType) : unfinished.length ? unfinished : [0,1,2]
      const index = choices.length === 1 ? 0 : Math.max(0,Math.min(choices.length-1,Math.floor(random()*choices.length)))
      pet.family = choices[index]; pet.phase = 1; pet.shiny = random() < SHINY_CHANCE; pet.obtainedAt = now; hatch = true
      pet.path=[FAMILIES[pet.family].species[0]];pet.evolutionTarget=null
    } else {
      pet.path=[...growthPath(pet),options.length===1 ? options[0] : pet.evolutionTarget!]
      pet.phase++;pet.evolutionTarget=null;evolves++
    }
    game.displayPhase = pet.phase; register(game, pet)
  }
  if (pet.phase > 0 && pet.phase === finalPhase(pet)) {
    complete(game, pet, now)
    game.candyTokens += pet.xp; pet.xp = 0
  }
  const notices=[hatch ? `${pet.shiny ? '이로치 ' : ''}부화 1회` : '', evolves ? `진화 ${evolves}회` : '',waiting && !wasWaiting ? '진화 준비 완료 · 목표를 골라주세요. 새 토큰은 사탕으로 쌓입니다.' : ''].filter(Boolean)
  return notices.length ? notices.join(' · ') : null
}
export function advanceGame(game: GameState, tokens: number, pace: Pace, now: string, random = Math.random): string | null {
  if (!Number.isSafeInteger(tokens) || tokens <= 0) return null
  game.tokensEarned += tokens
  if (!isGrowing(game)) { game.candyTokens += tokens; return null }
  return grow(game, tokens, pace, now, random)
}
export function changePace(game: GameState, before: Pace, after: Pace): void {
  for (const pet of game.pets) if (pet.phase === 0 || pet.phase < finalPhase(pet)) {
    pet.xp = waitingForEvolution(pet,before) ? threshold(pet.phase,after) : Math.min(threshold(pet.phase, after)-1, Math.floor(pet.xp / threshold(pet.phase, before) * threshold(pet.phase, after)))
  }
}
export function gameAction(game: GameState, action: GameAction, pace: Pace, now: string): string {
  if (action.type === 'egg') {
    if (!eggFamilies(action.eggType).length) throw new Error('선택할 수 없는 알입니다.')
    let pet = game.pets.find(p => p.phase === 0 && p.eggType === action.eggType)
    if (!pet) { pet = { id: `pet:${game.nextId++}`, family: null, phase: 0, xp: 0, shiny: false, eggType: action.eggType, obtainedAt: null, path: [], evolutionTarget: null }; game.pets.push(pet) }
    game.activeId = pet.id; game.displayPhase = 0
    return '알을 선택했어요. 이전 친구의 성장 상태는 보관됩니다.'
  }
  if (action.type === 'select') {
    const pet = game.pets.find(p => p.id === action.petId)
    if (!pet || !Number.isInteger(action.phase) || action.phase < 0 || action.phase > pet.phase || (pet.phase > 0 && !growthPath(pet)[action.phase-1])) throw new Error('아직 만날 수 없는 포켓몬입니다.')
    game.activeId = pet.id; game.displayPhase = action.phase
    return isGrowing(game) ? '이전에 키우던 상태에서 성장을 이어갑니다.' : '완성한 모습으로 함께해요. 새 토큰은 사탕으로 모입니다.'
  }
  const pet = activePet(game)
  if (action.type==='target') {
    const options=evolutionOptions(pet)
    if (!isGrowing(game) || options.length<2 || (action.speciesId!==null && !options.includes(action.speciesId))) throw new Error('선택할 수 없는 진화 목표입니다.')
    pet.evolutionTarget=action.speciesId
    return grow(game,0,pace,now,Math.random) ?? (action.speciesId ? `${POKEMON.find(p=>p.id===action.speciesId)!.name}를 목표로 키워요.` : '진화 목표를 아직 정하지 않았어요.')
  }
  if (pet.phase === 0) throw new Error('알에는 사탕을 사용할 수 없어요.')
  if (!isGrowing(game)) throw new Error('이 모습의 성장은 이미 완료됐어요.')
  if (waitingForEvolution(pet,pace)) throw new Error('진화 목표를 먼저 골라주세요.')
  if (!Number.isSafeInteger(action.count) || action.count < 1 || action.count > candyCount(game)) throw new Error('사용할 사탕이 부족해요.')
  let remaining = -pet.xp
  let id=growthPath(pet).at(-1)!,phase=pet.phase
  while ((EVOLUTIONS[id] ?? []).length) {
    remaining+=threshold(phase,pace)
    const options=EVOLUTIONS[id],next=options.length===1 ? options[0] : phase===pet.phase && options.includes(pet.evolutionTarget ?? -1) ? pet.evolutionTarget : null
    if (!next) break
    id=next;phase++
  }
  const spent = Math.min(action.count*CANDY_XP, remaining)
  game.candyTokens -= spent
  const notice = grow(game, spent, pace, now, Math.random)
  return `사탕 ${spent.toLocaleString('ko-KR')} XP 사용${notice ? ` · ${notice}` : ''}`
}
export interface LegacyGame { phase: number; family: number | null; xp: number; tokensEarned: number; owned: number[]; captures: { family: number; completedAt: string }[] }
export function migrateGame(old: LegacyGame, now: string): GameState {
  const game = newGame(); game.pets = []; game.captures = []; game.nextId = 1
  game.tokensEarned = old.tokensEarned; game.owned = [...old.owned]
  const add = (family: number | null, phase: number, xp=0): Companion => {
    const pet: Companion = { id: `pet:${game.nextId++}`, family, phase, xp, shiny: false, eggType: family === null ? null : FAMILIES[family].eggTypes[0], obtainedAt: family === null ? null : now, path: family===null ? [] : [...FAMILIES[family].species.slice(0,phase)], evolutionTarget: null }
    game.pets.push(pet); return pet
  }
  for (const capture of old.captures) { const pet = add(capture.family,3); complete(game,pet,capture.completedAt) }
  for (const family of [0,1,2]) {
    if (family === old.family || game.pets.some(p=>p.family===family)) continue
    const phases = old.owned.filter(id=>Math.floor((id-1)/3)===family).map(id=>(id-1)%3+1)
    if (phases.length) { const pet=add(family,Math.max(...phases)); if(pet.phase===3)complete(game,pet,now) }
  }
  const pet = add(old.family,old.phase,old.phase===3?0:old.xp)
  if (pet.phase===3) { complete(game,pet,now); game.candyTokens=old.xp }
  game.activeId=pet.id; game.displayPhase=pet.phase
  return game
}
