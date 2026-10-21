import data from './league-catalog.json'
import type { GameState } from './model'
import type { Language } from './i18n'
import { nationalId } from './catalog'
import { appearanceCollection } from './mega'

export type LocalNames = Record<Language,string>
export interface LeagueSeries { id:string; region:string; names:LocalNames }
export interface LeagueParty { trainer:LocalNames; species:number[]; basis:string; source:string }
export interface LeagueGoal { id:string; series:string; kind:'badge'|'title'; names:LocalNames; icon:string; type:string; parties:LeagueParty[] }
export interface LeagueDisplay { badges:string[]; title:string|null }
export interface LeagueState extends LeagueDisplay { unlocked:Record<string,string> }
export const LEAGUE_SERIES=data.series as LeagueSeries[]
export const LEAGUE_GOALS=data.goals as LeagueGoal[]
export const LEAGUE_BY_ID=new Map(LEAGUE_GOALS.map(goal=>[goal.id,goal]))
export const newLeague=():LeagueState=>({unlocked:{},badges:[],title:null})
export function registeredSpecies(game:GameState):Set<number> {
  const forms=appearanceCollection(game)
  return new Set([...game.owned,...game.ownedShiny,...forms.owned,...forms.ownedShiny].map(nationalId))
}
export function leagueRequirements(goal:LeagueGoal):number[]{return [...new Set(goal.parties.flatMap(party=>party.species))]}
export function leagueProgress(goal:LeagueGoal,registered:Set<number>):{owned:number[];missing:number[];total:number} {
  const required=leagueRequirements(goal)
  return {owned:required.filter(id=>registered.has(id)),missing:required.filter(id=>!registered.has(id)),total:required.length}
}
export function unlockLeague(game:GameState,state:LeagueState,now:string):string[] {
  const registered=registeredSpecies(game),added:string[]=[]
  for(const goal of LEAGUE_GOALS)if(!state.unlocked[goal.id]&&leagueProgress(goal,registered).missing.length===0){state.unlocked[goal.id]=now;added.push(goal.id)}
  return added
}
export function validateLeagueDisplay(value:unknown,state:LeagueState):LeagueDisplay {
  if(!value||typeof value!=='object')throw new Error('잘못된 전시 설정입니다.')
  const {badges,title}=value as LeagueDisplay
  if(!Array.isArray(badges)||badges.length>8||new Set(badges).size!==badges.length||badges.some(id=>typeof id!=='string'||LEAGUE_BY_ID.get(id)?.kind!=='badge'||!state.unlocked[id])||title!==null&&(typeof title!=='string'||LEAGUE_BY_ID.get(title)?.kind!=='title'||!state.unlocked[title]))throw new Error('획득한 배지 8개와 칭호 1개까지 전시할 수 있어요.')
  return {badges:[...badges],title}
}
