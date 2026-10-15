import React, { useId } from 'react'
import { BallId, ballInfo } from '../../shared/rewards'

// Curved vectors stay sharp at the 40px desktop size and high display scales.
// Each instance owns its paint IDs: the collection, picker and pet coexist.
export function BallIcon({ ball = 'poke', className = '' }: { ball?: BallId; className?: string }): React.JSX.Element {
  const info = ballInfo(ball)
  const id = `ball-${useId().replace(/:/g, '')}`
  const ink = '#273443'
  const lower = ball === 'luxury' ? ['#494552', '#292733', '#1c202b'] : ball === 'dusk' ? ['#48534e', '#303c39', '#202b2a'] : ['#fffef8', '#edf1ef', '#b8c7d0']
  const coloredBand = ball === 'premier' || ball === 'luxury' || ball === 'dusk'
  const seam = 'M4 31.5Q32 36 60 31.5'
  return <svg className={`ball-icon ${className}`} data-ball={ball} viewBox="0 0 64 64" shapeRendering="geometricPrecision" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id={`${id}-edge`}><circle cx="32" cy="32" r="27.5"/></clipPath>
      <linearGradient id={`${id}-lower`} x1="15" y1="30" x2="43" y2="61" gradientUnits="userSpaceOnUse">
        <stop stopColor={lower[0]}/><stop offset=".6" stopColor={lower[1]}/><stop offset="1" stopColor={lower[2]}/>
      </linearGradient>
      <linearGradient id={`${id}-light`} x1="13" y1="7" x2="48" y2="58" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fff" stopOpacity=".24"/><stop offset=".45" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#12243b" stopOpacity=".24"/>
      </linearGradient>
    </defs>
    <g clipPath={`url(#${id}-edge)`}>
      <circle cx="32" cy="32" r="28" fill={`url(#${id}-lower)`}/>
      <path fill={info.top} d="M4 31.5a28 28 0 0 1 56 0Q32 36 4 31.5Z"/>
      {ball === 'great' && <g fill={info.accent} stroke={ink} strokeOpacity=".18" strokeWidth="1">
        <path d="M11 15Q15 9 23 7L21 26H13Z"/><path d="M41 7Q49 9 53 15L51 26H43Z"/>
      </g>}
      {ball === 'ultra' && <path fill={info.accent} d="M12 11Q17 7 24 5L23 27H15Zm28-6q7 2 12 6l-3 16h-8ZM23 9h18v7H23Z"/>}
      {ball === 'luxury' && <g fill="none" stroke={info.accent} strokeWidth="2.2" strokeLinecap="round">
        <path d="M10 19Q32 5 54 19"/><path d="M11 46Q32 58 53 46"/>
      </g>}
      {ball === 'dusk' && <g fill="#203e32">
        <path d="m26 5 12 0 5 10-11 7-11-7Z"/><path d="m8 19 10-4 7 9-5 7-12-3Z"/><path d="m46 15 10 4v9l-12 3-5-7Z"/>
      </g>}
      {ball === 'master' && <>
        <ellipse cx="13.5" cy="18" rx="9" ry="10" fill={info.accent}/><ellipse cx="50.5" cy="18" rx="9" ry="10" fill={info.accent}/>
        <path d="M26 23V14l6 6 6-6v9" fill="none" stroke="#fff9ff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/>
      </>}
      <circle cx="32" cy="32" r="28" fill={`url(#${id}-light)`}/>
      <path d={seam} fill="none" stroke={ink} strokeWidth={coloredBand ? 5.5 : 4.5}/>
      {coloredBand && <path d={seam} fill="none" stroke={info.accent} strokeWidth="3.3"/>}
      {ball === 'luxury' && <path d={seam} fill="none" stroke="#cc7165" strokeWidth="1"/>}
      <path d="M14 19q4-7 13-9" fill="none" stroke="#fff" strokeOpacity={ball === 'premier' ? '.75' : '.48'} strokeWidth="2.8" strokeLinecap="round"/>
      <circle cx="11.5" cy="23" r="1.2" fill="#fff" fillOpacity=".4"/>
      <path d="M19 49q13 7 26-1" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="1.4" strokeLinecap="round"/>
    </g>
    <circle cx="32" cy="32" r="27.5" fill="none" stroke={ball === 'luxury' ? '#90794f' : ink} strokeWidth="2.5"/>
    <circle cx="32" cy="33.5" r="8" fill={ink}/>
    <circle cx="32" cy="33.5" r="6" fill={ball === 'dusk' ? '#e9a769' : '#fffdf5'}/>
    <circle cx="32" cy="33.5" r="3.6" fill="#e9eeed" stroke="#aabac2" strokeWidth=".9"/>
    <path d="M29.8 33a2.5 2.5 0 0 1 3-1.8" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
}
