import { readFileSync, writeFileSync } from 'node:fs'
import { revision, base, table } from './pokeapi-data.mjs'

const species=JSON.parse(readFileSync('src/shared/catalog-data.json','utf8')).pokemon
const entries=await table('pokemon_species_flavor_text'),metadata=await table('pokemon_species')
const traits=readFileSync('src/shared/dialogue-facts.tsv','utf8').split(/\r?\n/).filter(s=>s&&!s.startsWith('#')).map(line=>{
  const [id,pattern,voice,ko,en,ja]=line.split('|')
  if(!ja)throw Error(`Invalid fact ${id}`)
  return {id,pattern,voice,text:{ko,en,ja},re:new RegExp(`\\b(?:${pattern})[a-z]*\\b`,'i')}
})
// Early English releases describe the species' original/default form. Later
// species-level entries can describe Alolan/Hisuian/Mega forms without a form ID.
const source=new Map(species.map(p=>{
  const rows=entries.filter(r=>Number(r.species_id)===p.id&&r.language_id==='9')
  const versions=[...new Set(rows.map(r=>Number(r.version_id)))].sort((a,b)=>a-b).slice(0,3)
  return [p.id,rows.filter(r=>versions.includes(Number(r.version_id)))]
}))
const frequency=new Map(traits.map(t=>[t.id,[...source.values()].filter(rows=>rows.some(r=>t.re.test(r.flavor_text.replace(/[\n\f]/g,' ')))).length]))
const signatures={}
for(const line of readFileSync('src/shared/dialogue-signatures.tsv','utf8').split(/\r?\n/).filter(s=>s&&!s.startsWith('#'))){
  const [ids,voice,ko,en,ja]=line.split('|');if(!ja)throw Error(`Invalid signature ${ids}`)
  for(const id of ids.split(',').map(Number)){if(signatures[id])throw Error(`Duplicate signature ${id}`);signatures[id]={voice,text:{ko,en,ja}}}
}
const floating=new Set([81,82,92,93,94,109,110,137,200,201,233,351,353,354,355,356,358,374,375,376,429,433,436,437,442,462,474,479,480,481,482,487,488,491,517,518,562,563,577,578,579,602,603,604,607,608,609,622,623,679,680,681,707,708,709,710,711,720,769,770,781,789,790,792,800,854,855,885,886,887,897,938,965,966,999,1000,1012,1013])
const soft=new Set([88,89,132,218,219,316,317,422,423,577,578,579,704,705,706,771,868,869])
const cocoons=new Set([11,14,266,268,541,665])
for(const id of [247,372])cocoons.add(id)
for(const id of [425,426])floating.add(id)
floating.add(292)
const cloaked=new Set([412,413,778])
const scenes={}
for(const line of readFileSync('src/shared/dialogue-scenes.tsv','utf8').split(/\r?\n/).filter(s=>s&&!s.startsWith('#'))){
  const [targets,event,ko,en,ja]=line.split('|');if(!ja)throw Error(`Invalid scene ${targets}/${event}`)
  for(const target of targets.split(',')){const group=scenes[target]??={};(group[event]??=[]).push({ko,en,ja})}
}
const sources={},profiles={},unmatched=[]
for(const p of species){
  const rows=source.get(p.id),last=Math.max(...rows.map(r=>Number(r.version_id))),latest=rows.filter(r=>Number(r.version_id)===last).map(r=>r.flavor_text).join(' ').replace(/[\n\f]/g,' ')
  const matches=traits.filter(t=>rows.some(r=>t.re.test(r.flavor_text.replace(/[\n\f]/g,' ')))).map(t=>({trait:t,score:1/Math.log2(2+frequency.get(t.id))*(t.re.test(latest)?2:1)})).sort((a,b)=>b.score-a.score)
  const facts=matches.slice(0,3).map(t=>t.trait.id)
  const s=metadata.find(s=>Number(s.id)===p.id),shape=Number(s.shape_id)
  const body=cloaked.has(p.id)?'cloaked':cocoons.has(p.id)?'cocoon':soft.has(p.id)?'soft':floating.has(p.id)?'floating':shape===1?'round':shape===2?'serpent':shape===3?'fins':shape===5?'blob':shape===9||shape===13?'wings':shape===11?'cluster':shape===14?'manyfeet':Number(s.habitat_id)===7&&p.types.includes('water')?'aquatic':'grounded'
  profiles[p.id]={facts,body,voice:signatures[p.id]?.voice??matches[0]?.trait.voice??'curious',phase:p.phase,...(signatures[p.id]?{signature:signatures[p.id].text}:{}),sourceVersion:last}
  if(!facts.length&&!signatures[p.id])unmatched.push({id:p.id,name:p.name,text:latest})
}
for(const t of traits)sources[t.id]={text:t.text,voice:t.voice}
if(unmatched.length){writeFileSync('artifacts/dialogue-research/unmatched.json',JSON.stringify(unmatched,null,2));throw Error(`Missing factual profiles: ${unmatched.length}; see artifacts/dialogue-research/unmatched.json`)}
const output={source:{repository:'https://github.com/PokeAPI/pokeapi',revision,files:[`${base}pokemon_species_flavor_text.csv`,`${base}pokemon_species.csv`],policy:'Original fan dialogue based on factual traits; official Pokédex prose is not bundled. First three English release entries are used for default-form trait evidence, avoiding later regional/Mega descriptions.'},facts:sources,profiles,scenes}
writeFileSync('src/shared/character-profiles.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({species:species.length,traits:traits.length,individualSignatures:Object.keys(signatures).length,bodyProfiles:[...new Set(Object.values(profiles).map(p=>p.body))]},null,2))
