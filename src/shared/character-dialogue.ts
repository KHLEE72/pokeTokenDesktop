import raw from './character-profiles.json'
import type { Language } from './i18n'
import type { DialogueEvent } from './dialogue'

type Text = Record<Language,string>
interface Profile {facts:string[];body:string;voice:string;phase:number;signature?:Text;sourceVersion:number}
interface CharacterData {profiles:Record<number,Profile>;facts:Record<string,{text:Text;voice:string}>;scenes:Record<string,Partial<Record<DialogueEvent,Text[]>>>}
export const CHARACTER_DATA = raw as CharacterData

// Traits are researched at build time. The application only selects local text;
// no model calls, official Pokédex quotations, or name/type-prefix templates.
export function characterDialogue(id:number|null,event:DialogueEvent,language:Language):readonly string[]|null {
  const profile=id===null?undefined:CHARACTER_DATA.profiles[id]
  if(!profile)return null
  const scene=(key:string):string[]=>CHARACTER_DATA.scenes[key]?.[event]?.map(t=>t[language])??[]
  const base=scene('body:grounded'),body=scene(`body:${profile.body}`)
  const physical=body.length?body:base
  const voice=scene(`voice:${profile.voice}`)
  const individual=scene(`species:${id}`)
  const facts=profile.facts.flatMap(key=>scene(`fact:${key}`))
  const rotation=(profile.phase-1)%physical.length
  const candidates=event==='idle'?
    [...individual,...(profile.signature?[profile.signature[language]]:[]),...profile.facts.map(key=>CHARACTER_DATA.facts[key].text[language]),...voice,...physical]:
    [...individual,...facts.slice(0,1),...voice,physical[rotation],...facts.slice(1),...physical,...base]
  const lines=[...new Set(candidates.filter((line):line is string=>Boolean(line)))].slice(0,3)
  if(lines.length!==3)throw Error(`Incomplete character dialogue: ${id}/${event}/${language}`)
  return lines
}
