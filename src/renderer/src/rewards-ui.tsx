import React from 'react'
import { Companion, GameAction, Settings, Snapshot } from '../../shared/model'
import { ACHIEVEMENTS, BALLS, ballInfo, ballUnlocked, THEMES, themeUnlocked } from '../../shared/rewards'
import { BallIcon } from './balls'

export function BallPicker({ pet, snapshot, busy, act, label = '현재 친구의 볼 선택' }: { pet: Companion; snapshot: Snapshot; busy: boolean; act: (action: GameAction) => void; label?: string }): React.JSX.Element | null {
  if (!pet.phase) return null
  return <label className="ball-picker"><BallIcon ball={pet.ball}/><select aria-label={label} data-pet-id={pet.id} value={pet.ball ?? 'poke'} disabled={busy} onChange={e => act({ type: 'ball', petId: pet.id, ball: e.target.value as typeof BALLS[number]['id'] })}>
    {BALLS.map(ball => <option key={ball.id} value={ball.id} disabled={!ballUnlocked(snapshot.rewards, ball.id)}>{ball.name}{ballUnlocked(snapshot.rewards, ball.id) ? '' : ' · 미획득'}</option>)}
  </select></label>
}
export function Achievements({ snapshot, busy, update, navigate }: { snapshot: Snapshot; busy: boolean; update: (patch: Partial<Settings>) => void; navigate: (tab: string) => void }): React.JSX.Element {
  const completed = ACHIEVEMENTS.filter(a => ballUnlocked(snapshot.rewards, a.ball)).length
  return <section className="achievements-page" aria-label="업적과 볼 컬렉션">
    <div className="page-heading"><div><h1>작은 발자국, 새로운 볼</h1><p>업적 {completed} / {ACHIEVEMENTS.length} 달성 · 볼과 화면 테마가 함께 열려요.</p></div><span className="achievement-total">볼 {completed + 1} / {BALLS.length}</span></div>
    <div className="ball-collection" aria-label="나의 볼 컬렉션">{BALLS.map(ball => <div key={ball.id} className={ballUnlocked(snapshot.rewards, ball.id) ? 'collected' : 'uncollected'}><BallIcon ball={ball.id}/><strong>{ball.name}</strong><small>{ball.id === 'poke' ? '기본 제공' : ballUnlocked(snapshot.rewards, ball.id) ? '획득 완료' : '아직 미획득'}</small></div>)}</div>
    <p className="achievement-help">조건을 달성하면 자동으로 해금돼요. 이미 키운 친구와 도감 기록도 인정합니다. 볼은 개체별로, 화면 테마는 설정에서 자유롭게 골라주세요.</p>
    <div className="achievement-grid">{ACHIEVEMENTS.map(a => {
      const unlocked = ballUnlocked(snapshot.rewards, a.ball), value = Math.min(a.goal, Math.max(0, a.value(snapshot.game))), ball = ballInfo(a.ball)
      return <article key={a.ball} className={`achievement-card ${unlocked ? 'completed' : ''}`} data-achievement={a.ball}>
        <div className="achievement-heading"><BallIcon ball={a.ball}/><span className="achievement-status">{unlocked ? '✓ 달성 완료' : '도전 중'}</span></div>
        <h2>{a.title}</h2><p>{a.description}</p>
        <div className="achievement-meter"><span>{unlocked ? '달성 완료' : `${value.toLocaleString('ko-KR')} / ${a.goal.toLocaleString('ko-KR')} ${a.unit}`}</span><div className="progress-track" role="progressbar" aria-label={`${a.title} 진행률`} aria-valuemin={0} aria-valuemax={a.goal} aria-valuenow={unlocked ? a.goal : value}><div style={{ width: `${unlocked ? 100 : value / a.goal * 100}%` }}/></div></div>
        <div className="achievement-reward"><strong>{ball.name}</strong><span>개체 볼 + 화면 테마</span></div>
        {unlocked ? <div className="achievement-actions"><button className="button subtle" onClick={() => navigate('home')}>볼 골라주기</button><button className="button primary" disabled={busy || snapshot.settings.theme === a.ball} onClick={() => update({ theme: a.ball })}>{snapshot.settings.theme === a.ball ? '테마 사용 중' : '테마 적용'}</button></div> : <span className="reward-locked">달성하면 자동으로 열려요</span>}
      </article>
    })}</div>
  </section>
}
export function ThemePicker({ snapshot, busy, update, navigate }: { snapshot: Snapshot; busy: boolean; update: (patch: Partial<Settings>) => void; navigate: (tab: string) => void }): React.JSX.Element {
  return <section className="settings-card"><h3>화면 테마</h3><p className="section-help">포켓몬의 볼과 화면 테마는 따로 고를 수 있어요. 기본 두 테마는 언제든 사용할 수 있습니다.</p>
    <div className="theme-grid">{THEMES.map(theme => {
      const unlocked = themeUnlocked(snapshot.rewards, theme.id), achievement = ACHIEVEMENTS.find(a => a.ball === theme.ball)
      return <button key={theme.id} type="button" className={`theme-card ${snapshot.settings.theme === theme.id ? 'selected' : ''}`} data-theme-choice={theme.id} aria-label={`${theme.name} 테마${unlocked ? '' : ' 획득 조건 보기'}`} aria-pressed={snapshot.settings.theme === theme.id} disabled={busy} onClick={() => unlocked ? update({ theme: theme.id }) : navigate('achievements')}>
        <span className="theme-preview" style={{ '--preview-paper': theme.colors[0], '--preview-accent': theme.colors[1], '--preview-exp': theme.colors[2] } as React.CSSProperties}><i/><span><b/><b/><em/></span>{theme.ball && <BallIcon ball={theme.ball}/>}</span>
        <strong>{theme.name}</strong><small>{unlocked ? snapshot.settings.theme === theme.id ? '✓ 사용 중' : theme.ball === 'poke' || theme.ball === null ? '기본 제공' : '사용할 수 있어요' : `잠김 · ${achievement?.title}`}</small>
      </button>
    })}</div>
  </section>
}
