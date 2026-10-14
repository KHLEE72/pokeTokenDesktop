import React from 'react'
import { BallId, ballInfo } from '../../shared/rewards'

// Small code-drawn icons match the existing pixel UI; no runtime asset download.
export function BallIcon({ ball = 'poke', className = '' }: { ball?: BallId; className?: string }): React.JSX.Element {
  const info = ballInfo(ball)
  return <svg className={`ball-icon ${className}`} data-ball={ball} viewBox="0 0 24 24" shapeRendering="crispEdges" aria-hidden="true">
    <path fill="#263341" d="M8 2h8v2h4v4h2v8h-2v4h-4v2H8v-2H4v-4H2V8h2V4h4Z"/>
    <path fill={info.top} d="M8 4h8v2h4v5H4V8h2V6h2Z"/>
    <path fill={ball === 'luxury' ? '#393541' : ball === 'dusk' ? '#33343b' : '#fff8ec'} d="M4 13h16v3h-2v2h-2v2H8v-2H6v-2H4Z"/>
    {ball === 'great' && <path fill={info.accent} d="M6 6h2v4H6Zm10 0h2v4h-2Z"/>}
    {ball === 'ultra' && <path fill={info.accent} d="M6 6h3v4H6Zm9 0h3v4h-3Zm-6-2h6v2H9Z"/>}
    {ball === 'premier' && <path fill={info.accent} d="M4 10h16v2H4Z"/>}
    {ball === 'luxury' && <path fill={info.accent} d="M6 5h12v2H6Zm0 12h12v2H6Z"/>}
    {ball === 'dusk' && <path fill="#253f30" d="M8 4h8v2H8Zm-2 4h3v3H6Zm9 0h3v3h-3Z"/>}
    {ball === 'master' && <><path fill={info.accent} d="M4 6h4v4H4Zm12 0h4v4h-4Z"/><path fill="#fff" d="M9 5h2v2h2V5h2v5h-2V8h-2v2H9Z"/></>}
    <path fill={ball === 'premier' || ball === 'luxury' || ball === 'dusk' ? info.accent : '#263341'} d="M2 11h20v2H2Z"/>
    <path fill="#263341" d="M9 9h6v6H9Z"/><path fill="#fff8ec" d="M10 10h4v4h-4Z"/><path fill="#d5dee1" d="M11 11h2v2h-2Z"/>
    <path fill="#ffffff88" d="M8 6h3v2H8Z"/>
  </svg>
}
