import { readFileSync, writeFileSync } from 'node:fs'
import { base, revision, table } from './pokeapi-data.mjs'

// Official localized game names from PokéAPI's source data, pinned for offline use.
const files=['pokemon_species_names','type_names','types','items','item_names']
const tables=Object.fromEntries(await Promise.all(files.map(async name=>[name,await table(name)])))
const roster=JSON.parse(readFileSync('src/shared/catalog-data.json','utf8')).pokemon
const typeIds=new Map(tables.types.map(row=>[row.identifier,row.id]))
const itemIds=new Map(tables.items.map(row=>[row.identifier,row.id]))
const languageIds={ko:'3',en:'9',ja:'1'}
function names(table,key,id){
  const result={}
  for(const [language,languageId] of Object.entries(languageIds)){
    const row=table.find(row=>row[key]===String(id)&&row.local_language_id===languageId)
    if(!row?.name)throw Error(`Missing official ${language} name: ${key}/${id}`)
    result[language]=row.name
  }
  return result
}
const species=Object.fromEntries(roster.map(p=>[p.id,names(tables.pokemon_species_names,'pokemon_species_id',p.id)]))
const types=Object.fromEntries([...new Set(roster.flatMap(p=>p.types))].map(type=>[type,names(tables.type_names,'type_id',typeIds.get(type))]))
const identifiers={poke:'poke-ball',great:'great-ball',ultra:'ultra-ball',premier:'premier-ball',luxury:'luxury-ball',dusk:'dusk-ball',master:'master-ball',timer:'timer-ball',dream:'dream-ball',cherish:'cherish-ball'}
const balls=Object.fromEntries(Object.entries(identifiers).map(([key,id])=>[key,names(tables.item_names,'item_id',itemIds.get(id))]))
const result={source:{repository:'https://github.com/PokeAPI/pokeapi',revision,files:files.map(name=>`${base}${name}.csv`),languages:languageIds},species,types,balls}
writeFileSync('src/shared/localized-catalog.json',JSON.stringify(result,null,2)+'\n')
const license = await fetch(`https://raw.githubusercontent.com/PokeAPI/pokeapi/${revision}/LICENSE.md`)
if(!license.ok) throw Error(`Failed PokeAPI license: ${license.status}`)
writeFileSync('src/renderer/public/licenses/PokeAPI-BSD-3-Clause.txt',await license.text())
console.log(`Bundled official names for ${roster.length} Pokémon, ${Object.keys(types).length} types and ${Object.keys(balls).length} balls.`)
