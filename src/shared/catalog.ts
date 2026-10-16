import data from './catalog-data.json'
import formData from './form-catalog.json'

// Generated default-form roster. Regenerate with scripts/update-pokemon-catalog.mjs.
export const EGG_TYPES = [
  {
    "id": "normal",
    "name": "노말",
    "color": "#a8a878"
  },
  {
    "id": "fire",
    "name": "불꽃",
    "color": "#ef8050"
  },
  {
    "id": "water",
    "name": "물",
    "color": "#6890f0"
  },
  {
    "id": "electric",
    "name": "전기",
    "color": "#e5ba31"
  },
  {
    "id": "grass",
    "name": "풀",
    "color": "#78ad55"
  },
  {
    "id": "ice",
    "name": "얼음",
    "color": "#70bebe"
  },
  {
    "id": "fighting",
    "name": "격투",
    "color": "#c7655c"
  },
  {
    "id": "poison",
    "name": "독",
    "color": "#a568b3"
  },
  {
    "id": "ground",
    "name": "땅",
    "color": "#bc995c"
  },
  {
    "id": "flying",
    "name": "비행",
    "color": "#9181c2"
  },
  {
    "id": "psychic",
    "name": "에스퍼",
    "color": "#e76894"
  },
  {
    "id": "bug",
    "name": "벌레",
    "color": "#93a834"
  },
  {
    "id": "rock",
    "name": "바위",
    "color": "#a59457"
  },
  {
    "id": "ghost",
    "name": "고스트",
    "color": "#8067a0"
  },
  {
    "id": "dragon",
    "name": "드래곤",
    "color": "#7862d0"
  },
  {
    "id": "dark",
    "name": "악",
    "color": "#78665a"
  },
  {
    "id": "steel",
    "name": "강철",
    "color": "#9194af"
  },
  {
    "id": "fairy",
    "name": "페어리",
    "color": "#d897b0"
  }
] as const
export type EggType = typeof EGG_TYPES[number]['id']
export interface PokemonSpecies { id: number; name: string; family: number; phase: number; types: readonly EggType[]; generation: number; legendary: boolean; mythical: boolean; speciesId?: number }
export type FormKind = 'regional' | 'special' | 'mega'
export interface PokemonForm extends PokemonSpecies { speciesId: number; formId: number; identifier: string; kind: FormKind; region: string | null; names: Record<'ko'|'en'|'ja',string>; stone?: string; baseAppearanceId?: number; dialogue:{body:string;voice:string;signature:Record<'ko'|'en'|'ja',string>}|null }
export interface PokemonFamily { family: number; eggTypes: readonly EggType[]; species: readonly number[] }
export const FORMS: readonly PokemonForm[] = formData.forms.map(f=>({...f,name:f.names.ko})) as PokemonForm[]
export const MEGA_FORMS = FORMS.filter(f=>f.kind==='mega')
export const GROWTH_FORMS = FORMS.filter(f=>f.kind!=='mega')
export const FORM_BY_ID: ReadonlyMap<number,PokemonForm> = new Map(FORMS.map(f=>[f.id,f]))
export const MEGA_STONES: readonly {id:string;itemId:number|null;names:Record<'ko'|'en'|'ja',string>;kind:string}[] = formData.stones
export const FAMILIES: readonly PokemonFamily[] = [...data.families,...formData.families] as PokemonFamily[]
const retiredHatchFamilies=new Set(formData.retiredHatchFamilies)
export const HATCH_FAMILIES=FAMILIES.filter(f=>!retiredHatchFamilies.has(f.family))
export const POKEMON: readonly PokemonSpecies[] = data.pokemon as PokemonSpecies[]
export const EVOLUTIONS: Readonly<Record<number, readonly number[]>> = {...data.evolutions,...formData.evolutions}
export const ALL_POKEMON: readonly PokemonSpecies[] = [...POKEMON,...FORMS]
export const POKEMON_BY_ID: ReadonlyMap<number, PokemonSpecies> = new Map(ALL_POKEMON.map(p=>[p.id,p]))
export const nationalId = (id:number):number => FORM_BY_ID.get(id)?.speciesId ?? id
export const GENERATIONS = [1,2,3,4,5,6,7,8,9] as const
