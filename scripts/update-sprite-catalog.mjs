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
const output={source:{repository:`https://github.com/${repository}`,revision},animated:{},png:{}}
for(const [variant,entries]of Object.entries(variants)){
  for(const [format,files]of Object.entries(entries))output[format][variant]=files.filter(f=>f.type==='blob'&&new RegExp(`^\\d+\\.${format==='animated'?'gif':'png'}$`).test(f.path)).map(f=>({id:Number(f.path.split('.')[0]),size:f.size})).filter(f=>f.id>=1&&f.id<=1025&&f.size>8&&f.size<2*1024*1024).map(f=>f.id).sort((a,b)=>a-b)
  for(let id=1;id<=1025;id++)if(!output.animated[variant].includes(id)&&!output.png[variant].includes(id))throw Error(`No ${variant} sprite for ${id}`)
}
writeFileSync('src/shared/sprite-catalog.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({revision,normalAnimated:output.animated.normal.length,shinyAnimated:output.animated.shiny.length,normalStatic:1025-output.animated.normal.length,shinyStatic:1025-output.animated.shiny.length},null,2))
