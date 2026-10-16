import React, { useEffect, useState } from 'react'
import { EGG_TYPES, EggType } from '../../shared/catalog'
import { eggName, pokemonName } from '../../shared/i18n'
import { usesArtwork } from '../../shared/sprites'
import { useI18n } from './i18n'

export function Egg({ type = 'grass' }: {type?: EggType | null;}): React.JSX.Element {
  const {language,t}=useI18n(),kind=EGG_TYPES.find(t=>t.id===type)
  return <svg className="egg" viewBox="0 0 32 40" shapeRendering="crispEdges" aria-label={kind?eggName(kind.id,language):t('기존 포켓몬 알')}><path fill="#283e5025" d="M8 38h16v2H8Z" /><path fill="#283e50" d="M14 2h4v2h4v4h2v4h2v4h2v14h-2v4h-2v2H8v-2H6v-4H4V16h2v-4h2V8h2V4h4Z" /><path fill="#fff6dc" d="M14 4h4v2h4v4h2v6h2v14h-2v4H8v-4H6V16h2v-6h2V6h4Z" /><path fill="#e9dcad" d="M22 16h2v14h-2v2H10v-2h10v-2h2Z" /><path fill={kind?.color??'#76b77d'} d="M12 8h4v4h-4Zm7 10h4v6h-4ZM8 24h6v4H8Z" /><path fill="#fff" d="M10 14h2v6h-2Zm2-2h2v2h-2Z" /></svg>
}
export function Sprite({id,shiny=false,eggType='grass',className=''}:{id:number|null;shiny?:boolean;eggType?:EggType|null;className?:string}):React.JSX.Element {
  const {language}=useI18n(),[url,setUrl]=useState<string|null>(null)
  useEffect(()=>{
    setUrl(null);if(!id)return
    let canceled=false
    const load=():void=>{void window.desktop.getSprite(id,shiny).then(value=>{if(!canceled)setUrl(value)}).catch(()=>{})}
    load();const timer=setInterval(load,60_000)
    return()=>{canceled=true;clearInterval(timer)}
  },[id,shiny])
  if(!id)return <div className={`sprite ${className}`}><Egg type={eggType}/></div>
  const name=pokemonName(id,language)
  return <div className={`sprite ${className}`} data-shiny={shiny} data-artwork={usesArtwork(id,shiny)||undefined}>{url?<img src={url} alt={name} draggable={false}/>:<div className="sprite-fallback"><span>✦</span><small>{name}</small></div>}</div>
}
