import { writeFileSync } from 'node:fs'
import { base, revision, table } from './pokeapi-data.mjs'

const names=['pokemon_species','pokemon','pokemon_types','types','pokemon_species_names','pokemon_evolution','pokemon_forms']
const data=Object.fromEntries(await Promise.all(names.map(async name=>[name,await table(name)])))
const species=data.pokemon_species.filter(s=>Number(s.generation_id)>=1&&Number(s.generation_id)<=9).sort((a,b)=>Number(a.id)-Number(b.id))
if(species.length!==1025||species.some((s,i)=>Number(s.id)!==i+1))throw Error('Unexpected National Pokédex coverage for generations 1–9')
const ids=new Set(species.map(s=>Number(s.id)))
const defaults=new Map(data.pokemon.filter(p=>p.is_default==='1'&&ids.has(Number(p.species_id))).map(p=>[Number(p.species_id),Number(p.id)]))
const formPokemon=new Map(data.pokemon_forms.map(f=>[Number(f.id),Number(f.pokemon_id)]))
const typeNames=new Map(data.types.map(t=>[t.id,t.identifier]))
const typesFor=id=>data.pokemon_types.filter(t=>Number(t.pokemon_id)===defaults.get(id)).sort((a,b)=>Number(a.slot)-Number(b.slot)).map(t=>typeNames.get(t.type_id))
const korean=new Map(data.pokemon_species_names.filter(n=>n.local_language_id==='3').map(n=>[Number(n.pokemon_species_id),n.name]))
const graph=Object.fromEntries(species.map(s=>[s.id,[]])),independent=[]
for(const s of species){
  const parent=Number(s.evolves_from_species_id)
  if(!parent)continue
  const rules=data.pokemon_evolution.filter(e=>Number(e.evolved_species_id)===Number(s.id))
  // Cosmetic forms sharing a default Pokémon (e.g. Vivillon patterns) keep
  // their species edge. Regional/stat/battle forms use a different Pokémon ID.
  const compatible=rules.some(e=>(!e.required_pokemon_form_id||formPokemon.get(Number(e.required_pokemon_form_id))===defaults.get(parent))&&(!e.evolved_pokemon_form_id||formPokemon.get(Number(e.evolved_pokemon_form_id))===defaults.get(Number(s.id))))
  if(compatible)graph[parent].push(Number(s.id));else independent.push(Number(s.id))
}
for(const children of Object.values(graph))children.sort((a,b)=>a-b)
const children=new Set(Object.values(graph).flat())
const roots=species.map(s=>Number(s.id)).filter(id=>!children.has(id))
// Save files already use these 19 numeric family IDs. Never reorder them.
const legacyRoots=[1,4,7,19,172,363,66,29,27,16,63,10,74,92,147,633,304,173,133]
if(legacyRoots.some(id=>!roots.includes(id)))throw Error('A legacy family root changed')
const orderedRoots=[...legacyRoots,...roots.filter(id=>!legacyRoots.includes(id))],membership=new Map(),families=[]
for(const [family,root] of orderedRoots.entries()){
  const roster=[],queue=[[root,1]]
  for(let i=0;i<queue.length;i++){
    const [id,phase]=queue[i]
    if(membership.has(id)||phase>3)throw Error(`Invalid/cyclic evolution path at ${id}`)
    membership.set(id,{family,phase});roster.push(id)
    queue.push(...graph[id].map(child=>[child,phase+1]))
  }
  families.push({family,eggTypes:typesFor(root),species:roster})
}
const pokemon=species.map(s=>({id:Number(s.id),name:korean.get(Number(s.id)),...membership.get(Number(s.id)),types:typesFor(Number(s.id)),generation:Number(s.generation_id),legendary:s.is_legendary==='1',mythical:s.is_mythical==='1'}))
if(membership.size!==1025||pokemon.some(p=>!p.name||!p.types.length||p.types.some(t=>!t)||p.family===undefined))throw Error('Incomplete species metadata')
const output={source:{repository:'https://github.com/PokeAPI/pokeapi',revision,files:names.map(n=>`${base}${n}.csv`),scope:'National Pokédex 1–1025, default forms; evolution conditions simplified to selectable branches',legacyRoots,independentSpecies:independent},families,pokemon,evolutions:graph}
writeFileSync('src/shared/catalog-data.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({species:pokemon.length,families:families.length,generations:Array.from({length:9},(_,i)=>pokemon.filter(p=>p.generation===i+1).length),independent:independent.map(id=>`${id} ${korean.get(id)}`)},null,2))
