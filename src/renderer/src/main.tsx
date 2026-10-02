import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { version } from '../../../package.json'
import { Snapshot, Settings, POKEMON, DisplayChoice, PetMotion } from '../../shared/model'
import { speciesId, threshold } from '../../shared/game'
import { usePetDialogue } from './pet-dialogue'
import './style.css'

const format = (v: number): string => new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
const names = { claude: 'Claude Code', codex: 'Codex' }
const labels = ['부화', '첫 번째 진화', '최종 진화', '성장 완료']
function useSnapshot(): Snapshot | null {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  useEffect(() => { const unsubscribe = window.desktop.onSnapshot(setSnapshot); void window.desktop.getSnapshot().then(setSnapshot); return unsubscribe }, [])
  return snapshot
}
function Egg(): React.JSX.Element {
  return <svg className="egg" viewBox="0 0 100 120" aria-label="포켓몬 알"><ellipse cx="50" cy="110" rx="27" ry="5" fill="#183d2920"/><path d="M50 7C34 7 12 49 12 74c0 24 15 36 38 36s38-12 38-36C88 49 66 7 50 7Z" fill="#fffbed" stroke="#314638" strokeWidth="3"/><path d="m31 29 11-6 10 11-4 11-14-3Zm27 29 14-7 9 12-7 15-13-4ZM21 76l14-7 10 9-4 13-15-3Z" fill="#76b77d"/><path d="M29 46c-4 8-6 17-6 23" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"/></svg>
}
function Sprite({ id, className = '' }: { id: number | null; className?: string }): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    setUrl(null); if (!id) return
    let canceled = false
    const load = (): void => { void window.desktop.getSprite(id).then(value => { if (!canceled) setUrl(value) }).catch(() => {}) }
    load(); const timer = setInterval(load, 60_000)
    return () => { canceled = true; clearInterval(timer) }
  }, [id])
  if (!id) return <div className={`sprite ${className}`}><Egg /></div>
  const name = POKEMON.find(p => p.id === id)?.name ?? '포켓몬'
  return <div className={`sprite ${className}`}>{url ? <img src={url} alt={name} draggable={false}/> : <div className="sprite-fallback"><span>✦</span><small>{name}</small></div>}</div>
}
function Pet(): React.JSX.Element | null {
  const snapshot = useSnapshot()
  const [motion, setMotion] = useState<PetMotion>({ direction: 1, state: 'idle', tilt: 0, impact: 0 })
  const { speech, greet } = usePetDialogue(snapshot, motion)
  const down = useRef<{ x: number; y: number; dragging: boolean; pointerId: number } | null>(null)
  useEffect(() => window.desktop.onMotion(setMotion), [])
  useEffect(() => {
    const move = (event: PointerEvent): void => {
      if (!down.current || event.pointerId !== down.current.pointerId) return
      if (!down.current.dragging && Math.hypot(event.screenX - down.current.x, event.screenY - down.current.y) > 4) {
        down.current.dragging = true
      }
    }
    const up = (event: PointerEvent): void => {
      if (!down.current || event.pointerId !== down.current.pointerId) return
      window.desktop.drag(down.current.dragging ? 'end' : 'cancel')
      if (!down.current.dragging) void window.desktop.openDashboard()
      down.current = null
      // Pointer capture ends after pointerup. Keep the character interactive until
      // its real pointerleave arrives as the window starts falling.
      window.desktop.pointer(true)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    const cancel = (): void => {
      if (!down.current) return
      window.desktop.drag(down.current.dragging ? 'end' : 'cancel')
      down.current = null; window.desktop.pointer(false)
    }
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('lostpointercapture', cancel)
    return () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel); window.removeEventListener('lostpointercapture', cancel)
    }
  }, [])
  if (!snapshot) return null
  return <div className="pet-surface" style={{ '--pet-size': `${snapshot.settings.size}px` } as React.CSSProperties}>
    {speech && <div key={`${speech.text}-${speech.until}`} className="pet-bubble" data-dialogue={speech.event} aria-live="polite">
      <span>{speech.text}</span>{speech.summary && <small>{speech.summary}</small>}
    </div>}
    <div className={`pet-character ${motion.state === 'held' ? 'held' : ''}`} data-motion={motion.state}
      style={{ transform: `scaleX(${-motion.direction})`, '--facing': -motion.direction } as React.CSSProperties}
      onPointerEnter={() => { window.desktop.pointer(true); greet() }}
      onPointerLeave={() => { if (!down.current) window.desktop.pointer(false) }}
      onPointerDown={event => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        down.current = { x: event.screenX, y: event.screenY, dragging: false, pointerId: event.pointerId }
        window.desktop.drag('start')
      }}
      onContextMenu={event => { event.preventDefault(); window.desktop.petMenu() }}>
      <span className="pet-shadow" aria-hidden="true"/>
      <div className={`pet-motion state-${motion.state} ${speech?.event === 'growth' ? 'celebrating' : ''}`} style={{
        '--sway': `${motion.tilt * -motion.direction}deg`, '--land-wide': 1 + motion.impact * 0.22,
        '--land-flat': 1 - motion.impact * 0.26, '--land-hop': `${4 + motion.impact * 7}px`
      } as React.CSSProperties}><Sprite id={speciesId(snapshot.game)} /></div>
      {motion.state === 'landing' && <span className="pet-dust" aria-hidden="true"><i/><i/><i/><i/></span>}
    </div>
  </div>
}
function App(): React.JSX.Element {
  const snapshot = useSnapshot()
  const [tab, setTab] = useState('home')
  const [error, setError] = useState<string | null>(null)
  const [displays, setDisplays] = useState<DisplayChoice[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => window.desktop.onNavigate(setTab), [])
  useEffect(() => { if (tab === 'settings') void window.desktop.getDisplays().then(setDisplays) }, [tab])
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null); setBusy(true)
    try { await action() } catch (e) { setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '작업을 완료하지 못했습니다.') } finally { setBusy(false) }
  }
  const update = (patch: Partial<Settings>): void => { void run(() => window.desktop.updateSettings(patch)) }
  if (!snapshot) return <main className="loading"><Egg/><p>작은 친구를 깨우는 중…</p></main>
  const { game, settings } = snapshot
  const id = speciesId(game), name = id ? POKEMON.find(p => p.id === id)!.name : '새로운 알'
  const goal = threshold(game.phase, settings.pace), progress = Math.min(100, game.xp / goal * 100)
  const today = snapshot.usage.claude.today + snapshot.usage.codex.today
  const all = snapshot.usage.claude.all + snapshot.usage.codex.all
  const connected = snapshot.roots.filter(r => r.state === 'connected').length
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">✦</span><div>PokeToken<span>DESKTOP COMPANION</span></div></div>
      <nav aria-label="주 메뉴">{[['home', '◉', '현재 펫 · 사용량'], ['dex', '▦', '나의 도감'], ['settings', '⚙', '설정']].map(([key, icon, text]) => <button key={key} className={tab === key ? 'nav-active' : ''} onClick={() => setTab(key)}><span>{icon}</span>{text}</button>)}</nav>
      <div className="sidebar-bottom"><span className={`status-dot ${connected ? 'online' : ''}`}/>{snapshot.scanning ? '사용량 확인 중' : connected ? '로그 연결됨' : '로그 연결 대기'}<p>평소처럼 코딩하세요.<br/>작은 친구가 함께 자랍니다.</p><small>v{version} · 내 컴퓨터에 저장</small></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><span className="eyebrow">YOUR LITTLE CODING COMPANION</span><span className="date">{new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</span></header>
      {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError(null)}>닫기</button></div>}
      {tab === 'home' && <>
        <div className="page-heading"><div><h1>오늘도, 함께 성장해요<span>✦</span></h1><p>코딩에 쓴 토큰이 작은 친구의 경험치가 됩니다.</p></div><button className="button subtle" disabled={busy || snapshot.scanning} onClick={() => void run(() => window.desktop.refresh())}>{snapshot.scanning ? '확인 중…' : '↻ 새로고침'}</button></div>
        <div className="home-grid">
          <section className="companion-card"><div className="card-top"><span className="pill">{game.phase === 0 ? '부화를 기다리는 중' : `성장 단계 ${game.phase} / 3`}</span><span className="small-label">MY COMPANION</span></div>
            <div className="habitat"><div className="cloud cloud-one"/><div className="cloud cloud-two"/><div className="sun"/><div className="hill hill-one"/><div className="hill hill-two"/><div className="ground"/><div className="habitat-sprite"><Sprite id={id}/></div><span className="grass grass-one">✧</span><span className="grass grass-two">✧</span></div>
            <div className="companion-description"><h2>{name}</h2><p>{game.phase === 0 ? '어떤 친구가 태어날까요?' : '당신의 코딩 시간을 차곡차곡 기억하고 있어요.'}</p></div>
            <div className="growth"><div><strong>{labels[game.phase]}까지</strong><span>{progress.toFixed(1)}%</span></div><div className="progress-track"><div style={{ width: `${progress}%` }}/></div><p><span>{format(game.xp)} / {format(goal)} 토큰</span><span>{format(Math.max(0, goal - game.xp))} 남음</span></p></div>
            <div className="companion-actions"><button className="button primary" disabled={busy} onClick={() => update({ visible: !settings.visible })}>{settings.visible ? '데스크톱 펫 숨기기' : '데스크톱 펫 보이기'}</button><button className="button icon-button" title={settings.paused ? '다시 걷기' : '이동 일시정지'} aria-label={settings.paused ? '다시 걷기' : '이동 일시정지'} onClick={() => update({ paused: !settings.paused })}>{settings.paused ? '▷' : 'Ⅱ'}</button></div>
          </section>
          <div className="right-column"><section className="stat-card today-card"><span className="small-label">TODAY'S TOKENS</span><h2>{format(today)}<small>토큰</small></h2><p>오늘의 코딩이 남긴 발자국</p><div className="provider-breakdown"><span><i className="provider-dot claude"/>Claude Code <strong>{format(snapshot.usage.claude.today)}</strong></span><span><i className="provider-dot codex"/>Codex <strong>{format(snapshot.usage.codex.today)}</strong></span></div></section>
            <section className="stat-card"><span className="small-label">YOUR COLLECTION</span><div className="collection-stat"><strong>{game.owned.length}<small> / 9</small></strong><span>발견한 포켓몬</span></div><div className="mini-starters">{[1, 4, 7].map(n => <Sprite key={n} id={n} className={game.owned.includes(n) ? '' : 'undiscovered'}/>)}</div><button className="text-button" onClick={() => setTab('dex')}>나의 도감 둘러보기 →</button></section>
          </div>
        </div>
        <section className="activity-strip"><div><span className="strip-icon">↗</span><div><span>전체 로컬 사용량</span><strong>{format(all)} 토큰</strong></div></div><div><span className="strip-icon">♡</span><div><span>연결 후 얻은 경험치</span><strong>{format(game.tokensEarned)} XP</strong></div></div><div><span className="strip-icon">✧</span><div><span>성장을 마친 친구</span><strong>{game.captures.length} 마리</strong></div></div></section>
        <footer className="home-footer"><span>{snapshot.notice ? `✦ ${snapshot.notice}` : '새로 쓰는 토큰으로 성장합니다. 기존 기록은 사용량에만 표시됩니다.'}</span><small>{snapshot.lastScan ? `${new Date(snapshot.lastScan).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 확인` : '첫 기록을 확인하는 중'}</small></footer>
      </>}
      {tab === 'dex' && <>
        <div className="page-heading"><div><h1>나의 작은 도감</h1><p>함께 성장하며 만난 친구들. {game.owned.length} / 9종을 발견했어요.</p></div><span className="pill">성장 완료 {game.captures.length}회</span></div>
        <div className="dex-grid">{POKEMON.map(p => <article key={p.id} className={`dex-card ${game.owned.includes(p.id) ? '' : 'locked'}`}><span className="dex-number">No. {String(p.id).padStart(3, '0')}</span><Sprite id={p.id}/><h3>{game.owned.includes(p.id) ? p.name : '아직 만나지 못했어요'}</h3><span className="dex-badge">{game.owned.includes(p.id) ? '발견함' : '미발견'}</span></article>)}</div>
        <section className="history"><h3>성장 완료 기록</h3>{game.captures.length ? game.captures.slice(-20).reverse().map((c, i) => <div key={`${c.completedAt}-${i}`}><span>{POKEMON[c.family * 3 + 2].name}</span><small>{new Date(c.completedAt).toLocaleString('ko-KR')}</small></div>) : <p>첫 친구가 성장을 마치면 여기에 기록됩니다.</p>}</section>
      </>}
      {tab === 'settings' && <>
        <div className="page-heading"><div><h1>함께하는 방식</h1><p>성장 속도와 데스크톱 펫을 내 취향에 맞춰보세요.</p></div></div>
        <section className="settings-card"><h3>성장과 모습</h3><div className="setting-row"><div><strong>성장 속도</strong><p>변경해도 지금까지의 단계 진행률은 유지됩니다.</p></div><div className="segmented">{[['fast', '빠름'], ['normal', '기본'], ['slow', '느림']].map(([key, text]) => <button key={key} disabled={busy} className={settings.pace === key ? 'selected' : ''} onClick={() => update({ pace: key as Settings['pace'] })}>{text}</button>)}</div></div>
          <div className="setting-row"><div><strong>캐릭터 크기</strong><p>화면 위에 보이는 친구의 크기</p></div><div className="segmented">{([96, 128, 192] as const).map(size => <button key={size} disabled={busy} className={settings.size === size ? 'selected' : ''} onClick={() => update({ size })}>{size}px</button>)}</div></div>
          <div className="setting-row"><div><strong>함께할 화면</strong><p>모니터가 분리되면 기본 화면으로 돌아옵니다.</p></div><select aria-label="함께할 화면" value={displays.some(d => d.id === settings.displayId) ? settings.displayId! : ''} onChange={e => update({ displayId: e.target.value || null })}><option value="">기본 화면</option>{displays.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
          <div className="setting-row"><div><strong>컴퓨터를 켜면 함께 시작</strong><p>로그인할 때 앱을 자동으로 실행합니다.</p></div><button disabled={busy} role="switch" aria-checked={settings.autoStart} aria-label="자동 시작" className={`toggle ${settings.autoStart ? 'on' : ''}`} onClick={() => update({ autoStart: !settings.autoStart })}><span/></button></div>
        </section>
        <section className="settings-card"><h3>토큰 사용 기록 연결</h3><p className="section-help">기본 폴더를 자동으로 찾습니다. 다른 위치나 WSL에 있는 기록은 폴더를 추가하세요.</p>
          {(['claude', 'codex'] as const).map(provider => <div className="provider-settings" key={provider}><div className="provider-title"><strong><i className={`provider-dot ${provider}`}/>{names[provider]}</strong><button className="button subtle" disabled={busy} onClick={() => void run(async () => {
            const path = await window.desktop.chooseFolder(provider)
            if (path) await window.desktop.updateSettings({ roots: { ...settings.roots, [provider]: [...new Set([...settings.roots[provider], path])] } })
          })}>+ 폴더 추가</button></div>
            {snapshot.roots.filter(r => r.provider === provider).map(r => <div className="root-row" key={r.path}><span className={`status-dot ${r.state === 'connected' ? 'online' : r.state === 'error' ? 'warning' : ''}`}/><div><code>{r.path}</code><small>{r.state === 'connected' ? `${r.files}개 로그 연결됨${r.skipped ? ` · 불완전한 기록 ${r.skipped}개 건너뜀` : ''}` : r.state === 'missing' ? '폴더가 아직 없습니다. 기록이 생기면 자동으로 연결됩니다.' : r.error}</small></div>{settings.roots[provider].includes(r.path) && <button className="remove-button" aria-label={`${r.path} 연결 제거`} onClick={() => update({ roots: { ...settings.roots, [provider]: settings.roots[provider].filter(p => p !== r.path) } })}>×</button>}</div>)}
            {!snapshot.roots.some(r => r.provider === provider) && <p className="empty-root">연결할 로그 폴더를 추가해주세요.</p>}
          </div>)}
          <p className="privacy-note">⌂ 기록은 내 컴퓨터에서 처리합니다. 대화 내용과 인증 정보는 저장하거나 전송하지 않습니다.<br/>새 폴더의 기존 기록은 경험치에 소급 적용되지 않습니다.</p>
        </section>
      </>}
    </main>
  </div>
}
const view = new URLSearchParams(location.search).get('view')
document.body.classList.toggle('pet-body', view === 'pet')
document.documentElement.classList.toggle('pet-html', view === 'pet')
createRoot(document.getElementById('root')!).render(view === 'pet' ? <Pet/> : <App/>)
