import React from 'react'
import candy from './assets/rare-candy.png'
import ball from './assets/poke-ball.png'

export type PixelIconKind = 'ball' | 'candy' | 'dex' | 'settings' | 'token' | 'xp' | 'trophy' | 'grass' | 'moon' | 'sun'

export function PixelIcon({kind,className=''}:{kind:PixelIconKind;className?:string}):React.JSX.Element {
  const style=`pixel-icon ${className}`
  if(kind==='ball' || kind==='candy')return <img className={style} src={kind==='ball'?ball:candy} data-item={kind==='ball'?'poke-ball':'rare-candy'} alt="" aria-hidden="true" draggable={false}/>
  const art:Record<Exclude<PixelIconKind,'ball'|'candy'>,React.ReactNode>={
    moon:<><path fill="#c8b5fa" d="M9 2h6v2h-4v4H9v6h2v4h6v-2h3v-3h2v5h-2v2h-4v2H8v-2H4v-4H2V8h2V4h5Z"/><path fill="#fff0c7" d="M17 4h2v2h2v2h-2v2h-2V8h-2V6h2Z"/></>,
    sun:<><path fill="#dca843" d="M10 1h4v4h-4Zm0 18h4v4h-4ZM1 10h4v4H1Zm18 0h4v4h-4ZM4 4h3v3H4Zm13 0h3v3h-3ZM4 17h3v3H4Zm13 0h3v3h-3Z"/><path fill="#f4cb65" d="M9 6h6v2h3v8h-3v2H9v-2H6V8h3Z"/><path fill="#fff4d3" d="M9 8h3v3H9Z"/></>,
    dex:<><path fill="#283e50" d="M5 2h14v2h2v16h-2v2H5v-2H3V4h2Z"/><path fill="#e66b60" d="M5 4h14v16H5Z"/><path fill="#fff4d3" d="M7 7h10v8H7Z"/><path fill="#8fcbd2" d="M9 9h6v4H9Z"/><path fill="#283e50" d="M7 17h4v2H7Zm8 0h2v2h-2Z"/><path fill="#f4c856" d="M7 4h3v2H7Z"/></>,
    settings:<><path fill="#283e50" d="M9 2h6v4h3V4h3v5h-3v6h3v5h-3v-2h-3v4H9v-4H6v2H3v-5h3V9H3V4h3v2h3Z"/><path fill="#f4c856" d="M9 8h6v2h2v4h-2v2H9v-2H7v-4h2Z"/><path fill="#fff4d3" d="M10 10h4v4h-4Z"/></>,
    token:<><path fill="#283e50" d="M7 2h10v2h3v3h2v10h-2v3h-3v2H7v-2H4v-3H2V7h2V4h3Z"/><path fill="#f4c856" d="M7 4h10v2h3v12h-3v2H7v-2H4V6h3Z"/><path fill="#fff4d3" d="M7 6h3v2H7Zm-1 2h2v7H6Z"/><path fill="#b28437" d="M12 7h2v10h-2Zm-2 2h6v2h-6Z"/></>,
    xp:<><path fill="#283e50" d="M10 2h4v6h6v4h-6v8h-4v-8H4V8h6Z"/><path fill="#76c9df" d="M10 8h4v4h-4Zm0 4h2v6h-2Z"/><path fill="#fff4d3" d="M10 4h2v4h-2Zm-4 4h4v2H6Z"/><path fill="#e4bb56" d="M18 17h4v2h-4Zm2-2h2v6h-2Z"/></>,
    trophy:<><path fill="#283e50" d="M6 3h12v2h4v8h-4v2h-4v4h4v3H6v-3h4v-4H6v-2H2V5h4Z"/><path fill="#f4c856" d="M6 5h12v8h-2v2H8v-2H6Zm-2 2h2v4H4Zm14 0h2v4h-2ZM8 19h8v1H8Z"/><path fill="#fff4d3" d="M8 5h2v6H8Z"/></>,
    grass:<><path fill="#446d4d" d="M3 13h3v3h3v-6h3v3h3V7h3v6h3v3h-3v6H6v-3H3Z"/><path fill="#87ad59" d="M9 13h3v6H9Zm6 0h3v6h-3Z"/></>
  }
  return <svg className={style} viewBox="0 0 24 24" aria-hidden="true" shapeRendering="crispEdges">{art[kind]}</svg>
}
