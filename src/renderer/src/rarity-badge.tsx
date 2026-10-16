import React from 'react'
import { Rarity, rarityName } from '../../shared/rarity'
import { useI18n } from './i18n'

export function RarityBadge({rarity}:{rarity:Rarity}):React.JSX.Element|null {
  const {t}=useI18n()
  if(rarity==='ordinary')return null
  return <span className={`rarity-badge rarity-${rarity}`} data-rarity-badge={rarity}>
    <svg viewBox="0 0 24 24" aria-hidden="true">{rarity==='mythical'?<><path d="m12 1 3 7 7 4-7 4-3 7-3-7-7-4 7-4Z"/><path className="rarity-cut" d="m12 7 2 5-2 5-2-5Z"/></>:rarity==='legendary'?<><path d="m3 7 5 4 4-8 4 8 5-4-3 12H6Z"/><path className="rarity-cut" d="M8 16h8v2H8Z"/></>:<><path d="M2 5h5l3 6-2 6-6-4 4-1ZM22 5h-5l-3 6 2 6 6-4-4-1Z"/><path d="m12 6 3 6-3 8-3-8Z"/></>}</svg>
    <strong>{t(rarityName(rarity))}</strong><i aria-hidden="true">✦</i>
  </span>
}
