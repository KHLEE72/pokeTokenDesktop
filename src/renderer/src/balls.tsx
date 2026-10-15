import React from 'react'
import type { BallId } from '../../shared/rewards'
import poke from './assets/balls/poke.png'
import great from './assets/balls/great.png'
import ultra from './assets/balls/ultra.png'
import premier from './assets/balls/premier.png'
import luxury from './assets/balls/luxury.png'
import dusk from './assets/balls/dusk.png'
import master from './assets/balls/master.png'
const images: Record<BallId,string> = {poke,great,ultra,premier,luxury,dusk,master}
// Preserve the original silhouette, raised panels and buttons, including offline.
export function BallIcon({ball='poke',className=''}:{ball?:BallId;className?:string}):React.JSX.Element {
  return <img className={`ball-icon ${className}`} data-ball={ball} src={images[ball] ?? images.poke} alt="" aria-hidden="true" draggable={false}/>
}
