import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const repository='PokeAPI/sprites',directory='artifacts/sprite-trees'
mkdirSync(directory,{recursive:true})
const api=path=>JSON.parse(execFileSync('gh',['api',`repos/${repository}/${path}`],{encoding:'utf8',maxBuffer:32*1024*1024}))
let previous
try{previous=JSON.parse(readFileSync('src/shared/sprite-catalog.json','utf8'))}catch{}
const revision=!process.argv.includes('--refresh')&&previous?.source.revision||api('git/ref/heads/master').object.sha
function tree(sha){
  const file=`${directory}/${sha}.json`;let result
  try{result=JSON.parse(readFileSync(file,'utf8'))}catch{result=api(`git/trees/${sha}`);writeFileSync(file,JSON.stringify(result))}
  if(result.truncated)throw Error('Truncated sprite directory')
  return result.tree
}
function descend(entries,path){for(const part of path.split('/')){const entry=entries.find(e=>e.path===part&&e.type==='tree');if(!entry)throw Error(`Missing sprite directory ${path}`);entries=tree(entry.sha)}return entries}
const pokemon=descend(tree(revision),'sprites/pokemon'),animated=descend(pokemon,'versions/generation-v/black-white/animated')
const variants={normal:{animated,png:pokemon},shiny:{animated:descend(animated,'shiny'),png:descend(pokemon,'shiny')}}
const artwork=descend(pokemon,'other/official-artwork')
const artworkVariants={normal:artwork,shiny:descend(artwork,'shiny')}
const output={source:{repository:`https://github.com/${repository}`,revision},animated:{},png:{},artwork:{}}
const formIds=JSON.parse(readFileSync('src/shared/form-catalog.json','utf8')).forms.map(f=>f.id)
const roster=new Set([...Array.from({length:1025},(_,i)=>i+1),...formIds])
for(const [variant,entries]of Object.entries(variants)){
  for(const [format,files]of Object.entries(entries))output[format][variant]=files.filter(f=>f.type==='blob'&&new RegExp(`^\\d+\\.${format==='animated'?'gif':'png'}$`).test(f.path)).map(f=>({id:Number(f.path.split('.')[0]),size:f.size})).filter(f=>roster.has(f.id)&&f.size>8&&f.size<2*1024*1024).map(f=>f.id).sort((a,b)=>a-b)
  output.artwork[variant]=artworkVariants[variant].filter(f=>f.type==='blob'&&/^\d+\.png$/.test(f.path)&&f.size>8&&f.size<2*1024*1024).map(f=>Number(f.path.split('.')[0])).filter(id=>roster.has(id)&&!output.animated[variant].includes(id)&&!output.png[variant].includes(id)).sort((a,b)=>a-b)
  const missing=[...roster].filter(id=>!output.animated[variant].includes(id)&&!output.png[variant].includes(id)&&!output.artwork[variant].includes(id))
  if(missing.length)throw Error(`No ${variant} sprites for ${missing.join(', ')}`)
}
writeFileSync('src/shared/sprite-catalog.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({revision,appearances:roster.size,normalAnimated:output.animated.normal.length,shinyAnimated:output.animated.shiny.length,normalStatic:roster.size-output.animated.normal.length,shinyStatic:roster.size-output.animated.shiny.length,artwork:output.artwork},null,2))
