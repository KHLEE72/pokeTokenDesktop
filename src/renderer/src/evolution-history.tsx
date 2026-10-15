import React, { useRef, useState } from 'react'
import type { GameState } from '../../shared/model'
import { capturedSpecies } from '../../shared/game'
import { localeFor, pokemonName } from '../../shared/i18n'
import { useI18n } from './i18n'

const PAGE_SIZE = 10
export function EvolutionHistory({ game }: { game: GameState }): React.JSX.Element {
  const { language, t } = useI18n()
  const [page, setPage] = useState(1)
  const panel = useRef<HTMLElement>(null)
  const pages = Math.max(1, Math.ceil(game.captures.length / PAGE_SIZE)), current = Math.min(page, pages)
  const records = game.captures.slice().reverse().slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const change = (next: number): void => { setPage(next); requestAnimationFrame(() => panel.current?.scrollIntoView({ block: 'start' })) }
  return <section ref={panel} className="evolution-history collection-panel" role="tabpanel" id="dex-history" aria-labelledby="dex-history-tab">
    <div className="evolution-history-heading"><div><h3>{t('최종 진화 기록')}</h3><p>{t('성장을 마친 친구들을 최근 순서로 모았어요.')}</p></div><span>{t`총 ${game.captures.length}마리`}</span></div>
    {records.length ? <ol className="evolution-history-list">{records.map(c => {
      const id = capturedSpecies(game, c)
      return <li key={c.petId}><span className="evolution-history-number">No. {String(id).padStart(3, '0')}</span><strong>{c.shiny ? t('✦ 이로치 ') : ''}{pokemonName(id, language)}</strong><time dateTime={c.completedAt}>{new Date(c.completedAt).toLocaleString(localeFor(language))}</time></li>
    })}</ol> : <p className="evolution-history-empty">{t('첫 친구가 최종 진화하면 여기에 기록됩니다.')}</p>}
    {pages > 1 && <nav className="evolution-history-pages" aria-label={t('진화 기록 페이지 이동')}><button className="button subtle" disabled={current === 1} onClick={() => change(current - 1)}>{t('이전 기록')}</button><span aria-live="polite">{t`${current} / ${pages} 페이지`}</span><button className="button subtle" disabled={current === pages} onClick={() => change(current + 1)}>{t('다음 기록')}</button></nav>}
  </section>
}
