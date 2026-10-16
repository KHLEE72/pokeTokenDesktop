import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const revision = '81d20919845b6a445969b9265aab5cec6b04cece'
export const base = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${revision}/data/v2/csv/`
export function csv(text) {
  const rows=[];let row=[],field='',quoted=false
  for(let i=0;i<text.length;i++){
    const c=text[i]
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}
    else if(!quoted&&(c===','||c==='\n')){row.push(field);field='';if(c==='\n'){rows.push(row);row=[]}}
    else if(c!=='\r')field+=c
  }
  if(field||row.length){row.push(field);rows.push(row)}
  const header=rows.shift();return rows.filter(row=>row.length===header.length).map(row=>Object.fromEntries(header.map((key,i)=>[key,row[i]])))
}
export async function table(name) {
  if(!/^[a-z_]+$/.test(name))throw Error('Invalid data table')
  const directory=join('artifacts','pokeapi-data',revision),path=join(directory,`${name}.csv`)
  let text
  try{text=await readFile(path,'utf8')}catch{
    const response=await fetch(`${base}${name}.csv`,{signal:AbortSignal.timeout(30_000)})
    if(!response.ok)throw Error(`Failed ${name}: ${response.status}`)
    text=await response.text();await mkdir(directory,{recursive:true});await writeFile(path,text)
  }
  return csv(text)
}
