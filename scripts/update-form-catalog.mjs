import { readFileSync, writeFileSync } from 'node:fs'
import { base, revision, table } from './pokeapi-data.mjs'

const files=['pokemon','pokemon_species','pokemon_forms','pokemon_form_names','pokemon_species_names','pokemon_types','types','pokemon_evolution','items','item_names','moves','move_names']
const data=Object.fromEntries(await Promise.all(files.map(async name=>[name,await table(name)])))
const original=JSON.parse(readFileSync('src/shared/catalog-data.json','utf8'))
const pokemon=new Map(data.pokemon.map(p=>[Number(p.id),p])),species=new Map(data.pokemon_species.map(p=>[Number(p.id),p]))
const originalById=new Map(original.pokemon.map(p=>[p.id,p]))
const formPokemon=new Map(data.pokemon_forms.map(f=>[Number(f.id),Number(f.pokemon_id)]))
const defaultPokemon=new Map(data.pokemon.filter(p=>p.is_default==='1').map(p=>[Number(p.species_id),Number(p.id)]))
const typeNames=new Map(data.types.map(t=>[t.id,t.identifier]))
const languageIds={ko:['3'],en:['9'],ja:['1','11']}
function localized(rows,key,id,field='name'){
  return Object.fromEntries(Object.entries(languageIds).map(([lang,ids])=>[lang,ids.map(language=>rows.find(n=>Number(n[key])===id&&n.local_language_id===language)?.[field]).find(Boolean)]))
}
const speciesNames=id=>localized(data.pokemon_species_names,'pokemon_species_id',id)
const supportIdentifiers=['basculin-white-striped','floette-eternal','meowstic-female','magearna-original','tatsugiri-droopy','tatsugiri-stretchy']
const regionalPattern=/^(alola|galar(?:-standard)?|hisui|paldea(?:-(?:combat|blaze|aqua)-breed)?)$/
const selected=data.pokemon_forms.filter(f=>f.is_mega==='1'||(f.is_battle_only==='0'&&(regionalPattern.test(f.form_identifier)||supportIdentifiers.includes(pokemon.get(Number(f.pokemon_id))?.identifier))))
const stonePairs=`venusaur:698 charizard-x:699 charizard-y:717 blastoise:700 alakazam:718 gengar:695 kangaskhan:714 pinsir:710 gyarados:715 aerodactyl:711 mewtwo-x:701 mewtwo-y:702 ampharos:697 scizor:709 heracross:719 houndoom:705 tyranitar:708 blaziken:703 gardevoir:696 mawile:720 aggron:706 medicham:704 manectric:721 banette:707 absol:716 garchomp:722 lucario:712 abomasnow:713 latias:760 latios:761 swampert:793 sceptile:794 sableye:795 altaria:796 gallade:797 audino:798 sharpedo:800 slowbro:801 steelix:802 pidgeot:803 glalie:804 diancie:805 metagross:799 camerupt:808 lopunny:809 salamence:810 beedrill:811 clefable:2233 victreebel:2234 starmie:2235 dragonite:2236 meganium:2237 feraligatr:2238 skarmory:2239 froslass:2240 emboar:2243 excadrill:2244 scolipede:2245 scrafty:2246 eelektross:2247 chandelure:2248 chesnaught:2249 delphox:2250 greninja:2251 pyroar:2252 floette:2253 malamar:2254 barbaracle:2255 dragalge:2256 hawlucha:2257 zygarde:2258 drampa:2259 falinks:2261 raichu-x:2262 raichu-y:2263 chimecho:2264 absol-z:2265 staraptor:2266 garchomp-z:2267 lucario-z:2268 heatran:2241 darkrai:2242 golurk:2269 meowstic:2270 crabominable:2271 golisopod:2272 magearna:2273 zeraora:2260 scovillain:2274 glimmora:2277 tatsugiri:2276 baxcalibur:2275`
const stoneIds=new Map(stonePairs.split(' ').map(s=>{const [name,id]=s.split(':');return [name,Number(id)]}))
const regionLabels={alola:{ko:'알로라의 모습',ja:'アローラのすがた'},galar:{ko:'가라르의 모습',ja:'ガラルのすがた'},hisui:{ko:'히스이의 모습',ja:'ヒスイのすがた'},paldea:{ko:'팔데아의 모습',ja:'パルデアのすがた'}}
const supportLabels={
  'basculin-white-striped':{ko:'백색근의 모습',ja:'しろすじのすがた'},
  'floette-eternal':{ko:'영원의 꽃',ja:'えいえんのはな'},
  'meowstic-female':{ko:'암컷의 모습',ja:'メスのすがた'},
  'magearna-original':{ko:'오리지널컬러',ja:'５００ねんまえのいろ'},
  'tatsugiri-droopy':{ko:'늘어진 모습',ja:'たれたすがた'},
  'tatsugiri-stretchy':{ko:'뻗은 모습',ja:'のびたすがた'}
}
const personalities=new Map(readFileSync('src/shared/form-dialogue.tsv','utf8').trim().split(/\r?\n/).filter(line=>!line.startsWith('#')).map(line=>{const [id,body,voice,ko,en,ja]=line.split('|');if(!body||!voice||!ko||!en||!ja)throw Error('Incomplete form dialogue');return [Number(id),{body,voice,signature:{ko,en,ja}}]}))
const forms=selected.map(f=>{
  const id=Number(f.pokemon_id),p=pokemon.get(id),speciesId=Number(p.species_id),s=species.get(speciesId),baseNames=speciesNames(speciesId)
  const mega=f.is_mega==='1',region=mega?null:Object.keys(regionLabels).find(r=>f.form_identifier.startsWith(r))??null
  const kind=mega?'mega':region?'regional':'special',formNames=localized(data.pokemon_form_names,'pokemon_form_id',Number(f.id),'form_name')
  const fullNames=localized(data.pokemon_form_names,'pokemon_form_id',Number(f.id),'pokemon_name')
  const suffix=/mega-([xyz])$/.exec(p.identifier)?.[1].toUpperCase()??''
  const label=region?regionLabels[region]:supportLabels[p.identifier]
  const breed=p.identifier.includes('-breed')?{combat:'컴배트종',blaze:'블레이즈종',aqua:'워터종'}[p.identifier.split('-').at(-2)]:null
  const names=mega?{ko:fullNames.ko||formNames.ko||`메가${baseNames.ko}${suffix}`,en:fullNames.en||formNames.en,ja:fullNames.ja||formNames.ja}:{ko:`${baseNames.ko} (${label.ko}${breed?` · ${breed}`:''})`,en:fullNames.en||`${baseNames.en} (${formNames.en})`,ja:`${baseNames.ja}（${formNames.ja||label.ja}${breed?`・${{combat:'コンバットしゅ',blaze:'ブレイズしゅ',aqua:'ウォーターしゅ'}[p.identifier.split('-').at(-2)]}`:''}）`}
  const types=data.pokemon_types.filter(t=>Number(t.pokemon_id)===id).sort((a,b)=>Number(a.slot)-Number(b.slot)).map(t=>typeNames.get(t.type_id))
  const dialogue=mega?null:personalities.get(id)
  if(!mega&&!dialogue)throw Error(`Missing form dialogue: ${id}`)
  return {id,speciesId,formId:Number(f.id),identifier:p.identifier,kind,region,names,types,generation:Number(s.generation_id),legendary:s.is_legendary==='1',mythical:s.is_mythical==='1',family:originalById.get(speciesId).family,phase:originalById.get(speciesId).phase,dialogue}
}).sort((a,b)=>a.id-b.id)
if(new Set(forms.map(f=>f.id)).size!==forms.length)throw Error('Duplicate appearance ID')
const included=new Set([...original.pokemon.map(p=>p.id),...forms.filter(f=>f.kind!=='mega').map(f=>f.id)])
const graph=structuredClone(original.evolutions)
for(const f of forms.filter(f=>f.kind!=='mega'))graph[f.id]=[]
function connect(from,to){if(!included.has(from)||!included.has(to)||from===to)return;if(!graph[from].includes(to))graph[from].push(to)}
for(const rule of data.pokemon_evolution){
  if(!rule.required_pokemon_form_id&&!rule.evolved_pokemon_form_id)continue
  const parent=Number(species.get(Number(rule.evolved_species_id))?.evolves_from_species_id)
  const from=rule.required_pokemon_form_id?formPokemon.get(Number(rule.required_pokemon_form_id)):defaultPokemon.get(parent)
  const to=rule.evolved_pokemon_form_id?formPokemon.get(Number(rule.evolved_pokemon_form_id)):defaultPokemon.get(Number(rule.evolved_species_id))
  if(from>1025||to>1025)connect(from,to)
}
// Basic forms whose regional evolution omits an explicit required form in CSV.
// Regional evolutions never lead back into a normal-form route.
connect(677,10025)
const baseParents=new Map(data.pokemon_species.filter(s=>s.evolves_from_species_id).map(s=>[Number(s.id),Number(s.evolves_from_species_id)]))
for(const f of forms.filter(f=>f.kind==='regional')){
  if(Object.values(graph).some(next=>next.includes(f.id)))continue
  const parent=baseParents.get(f.speciesId)
  if(!parent)continue
  const regionalParent=forms.find(p=>p.kind==='regional'&&p.speciesId===parent&&p.region===f.region)
  if(regionalParent)connect(regionalParent.id,f.id)
}
const families=[]
const assign=(root,family)=>{
  const roster=[],queue=[[root,1]]
  for(let i=0;i<queue.length;i++){
    const [id,phase]=queue[i];if(phase>3||roster.includes(id))throw Error('Invalid form growth graph')
    roster.push(id)
    const form=forms.find(f=>f.id===id)
    if(form){form.family=family;form.phase=phase}
    queue.push(...graph[id].map(child=>[child,phase+1]))
  }
  return roster
}
for(const family of original.families)assign(family.species[0],family.family)
const children=new Set(Object.values(graph).flat())
for(const form of forms.filter(f=>f.kind!=='mega'&&!children.has(f.id))){
  const family=original.families.length+families.length
  families.push({family,eggTypes:form.types,species:assign(form.id,family)})
}
const stones=[]
for(const f of forms.filter(f=>f.kind==='mega')){
  const p=pokemon.get(f.id),key=p.identifier.replace('-mega','').replace(/-(male|female|original|curly|droopy|stretchy)/g,'')
  const itemId=stoneIds.get(key)
  if(f.speciesId===384){
    const move=data.moves.find(m=>m.identifier==='dragon-ascent');f.stone='dragon-ascent';f.baseAppearanceId=384
    if(!stones.some(s=>s.id===f.stone))stones.push({id:f.stone,itemId:null,names:localized(data.move_names,'move_id',Number(move.id)),kind:'technique'})
  }else{
    const item=data.items.find(i=>Number(i.id)===itemId)
    if(!item)throw Error(`No Mega Stone: ${p.identifier}/${key}`)
    f.stone=item.identifier
    f.baseAppearanceId=f.speciesId===670?10061:defaultPokemon.get(f.speciesId)
    if(/(?:female|original|droopy|stretchy)-mega$/.test(p.identifier))f.baseAppearanceId=Number(data.pokemon.find(p2=>p2.identifier===p.identifier.replace('-mega','')).id)
    if(!stones.some(s=>s.id===f.stone))stones.push({id:f.stone,itemId,names:localized(data.item_names,'item_id',itemId),kind:'stone'})
  }
  const special=forms.find(p=>p.id===f.baseAppearanceId)
  if(special&&f.baseAppearanceId!==10061){
    const label=supportLabels[special.identifier]
    f.names.ko+=` (${label.ko})`
    if(!f.names.ja.includes(label.ja))f.names.ja+=`（${label.ja}）`
  }
}
for(const f of forms)if(!f.types.length||Object.values(f.names).some(n=>!n))throw Error(`Missing form metadata: ${f.identifier}`)
for(const stone of stones)if(Object.values(stone.names).some(n=>!n))throw Error(`Missing stone names: ${stone.id}`)
// The pinned CSV calls Floettite "플라베베나이트"; the official HOME notice
// names it "플라엣테나이트": https://news.pokemon-home.com/ko/page/716.html
stones.find(s=>s.id==='floettite').names.ko='플라엣테나이트'
const evolutions=Object.fromEntries(Object.entries(graph).filter(([id,next])=>Number(id)>1025||JSON.stringify(next)!==JSON.stringify(original.evolutions[id])))
const retiredHatchFamilies=original.families.filter(f=>original.source.independentSpecies.includes(f.species[0])&&children.has(f.species[0])).map(f=>f.family)
writeFileSync('src/shared/form-catalog.json',JSON.stringify({source:{repository:'https://github.com/PokeAPI/pokeapi',revision,files:files.map(name=>`${base}${name}.csv`),nameCorrections:['https://news.pokemon-home.com/ko/page/716.html'],scope:'Regional forms, Mega forms, and prerequisite appearances; game conditions simplified'},forms,families,evolutions,stones,retiredHatchFamilies},null,2)+'\n')
console.log(JSON.stringify({regional:forms.filter(f=>f.kind==='regional').length,special:forms.filter(f=>f.kind==='special').length,mega:forms.filter(f=>f.kind==='mega').length,stones:stones.length,families:families.length,evolutionOverrides:Object.keys(evolutions).length}))
