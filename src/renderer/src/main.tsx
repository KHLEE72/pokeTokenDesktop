import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { version } from '../../../package.json'
import { Snapshot, Settings, POKEMON, DisplayChoice, PetMotion, PetInputTrace, EGG_TYPES, FAMILIES, EggType, GameAction, GameState } from '../../shared/model'
import { activePet, candyCount, CANDY_XP, dexChoices, discoveredSpecies, eggFamilies, finalPhase, isGrowing, speciesId, threshold } from '../../shared/game'
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
function Egg({ type = 'grass' }: { type?: EggType | null }): React.JSX.Element {
  const kind=EGG_TYPES.find(t=>t.id===type)
  return <svg className="egg" viewBox="0 0 100 120" aria-label={kind ? `${kind.name} 알` : '기존 포켓몬 알'}><ellipse cx="50" cy="110" rx="27" ry="5" fill="#183d2920"/><path d="M50 7C34 7 12 49 12 74c0 24 15 36 38 36s38-12 38-36C88 49 66 7 50 7Z" fill="#fffbed" stroke="#314638" strokeWidth="3"/><path d="m31 29 11-6 10 11-4 11-14-3Zm27 29 14-7 9 12-7 15-13-4ZM21 76l14-7 10 9-4 13-15-3Z" fill={kind?.color ?? '#76b77d'}/><path d="M29 46c-4 8-6 17-6 23" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"/></svg>
}
function Sprite({ id, shiny = false, eggType = 'grass', className = '' }: { id: number | null; shiny?: boolean; eggType?: EggType | null; className?: string }): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    setUrl(null); if (!id) return
    let canceled = false
    const load = (): void => { void window.desktop.getSprite(id,shiny).then(value => { if (!canceled) setUrl(value) }).catch(() => {}) }
    load(); const timer = setInterval(load, 60_000)
    return () => { canceled = true; clearInterval(timer) }
  }, [id,shiny])
  if (!id) return <div className={`sprite ${className}`}><Egg type={eggType}/></div>
  const name = POKEMON.find(p => p.id === id)?.name ?? '포켓몬'
  return <div className={`sprite ${className}`} data-shiny={shiny}>{url ? <img src={url} alt={name} draggable={false}/> : <div className="sprite-fallback"><span>✦</span><small>{name}</small></div>}</div>
}
function Pet(): React.JSX.Element | null {
  const snapshot = useSnapshot()
  const [motion, setMotion] = useState<PetMotion>({ direction: 1, state: 'idle', tilt: 0, impact: 0 })
  const { speech, greet } = usePetDialogue(snapshot, motion)
  const [reaction, setReaction] = useState(0)
  const down = useRef<{ pointerId: number; target: HTMLDivElement } | null>(null)
  const motionRef = useRef(motion); motionRef.current=motion
  const trace = (value: PetInputTrace): void => window.desktop.tracePetInput({...value,pressed:Boolean(down.current),motion:motionRef.current.state})
  const captureError = (error: unknown): PetInputTrace['error'] => error instanceof DOMException && ['NotFoundError','InvalidStateError'].includes(error.name) ? error.name as PetInputTrace['error'] : 'Other'
  useEffect(()=>{
    const eventTrace=(event:Event):void=>{
      const e=event as PointerEvent,character=e.target instanceof Element?e.target.closest('.pet-character'):null
      const pressed=down.current
      trace({event:event.type as PetInputTrace['event'],pointerId:e.pointerId,button:e.button,buttons:e.buttons,x:e.clientX,y:e.clientY,
        onCharacter:Boolean(character),trusted:event.isTrusted,captured:pressed?.target.hasPointerCapture(pressed.pointerId)??false})
    }
    const events=['pointerdown','pointerup','pointercancel','gotpointercapture','lostpointercapture','mousedown','mouseup','click','contextmenu','dragstart']
    for(const name of events)window.addEventListener(name,eventTrace,true)
    const beat=(event:'ready'|'heartbeat'):void=>trace({event,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visible:document.visibilityState==='visible',focused:document.hasFocus(),captured:down.current?.target.hasPointerCapture(down.current.pointerId)??false})
    const error=(event:ErrorEvent):void=>trace({event:'runtime.error',line:event.lineno,column:event.colno})
    const rejection=():void=>trace({event:'runtime.rejection'})
    window.addEventListener('error',error);window.addEventListener('unhandledrejection',rejection)
    beat('ready');const timer=setInterval(()=>beat('heartbeat'),5000)
    return()=>{clearInterval(timer);for(const name of events)window.removeEventListener(name,eventTrace,true);window.removeEventListener('error',error);window.removeEventListener('unhandledrejection',rejection)}
  },[])
  useEffect(() => window.desktop.onMotion(setMotion), [])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const unsubscribe = window.desktop.onPetting(() => {
      setReaction(value => value + 1)
      clearTimeout(timer); timer = setTimeout(() => setReaction(0), 850)
    })
    return () => { unsubscribe(); clearTimeout(timer) }
  }, [])
  useEffect(() => {
    const reset = (): void => {
      trace({event:'reset'})
      const pressed = down.current
      down.current = null
      setReaction(0)
      try { if (pressed?.target.hasPointerCapture(pressed.pointerId)) pressed.target.releasePointerCapture(pressed.pointerId) }
      catch(error) { trace({event:'capture.release-failed',error:captureError(error)}) }
    }
    const unsubscribeReset = window.desktop.onInteractionReset(reset)
    const move = (event: PointerEvent): void => {
      if (!down.current || event.pointerId !== down.current.pointerId) return
      if(event.pointerType==='mouse' && !(event.buttons&1)) { up(event); return }
      // Native DIP cursor coordinates distinguish a petting click from a drag.
      // DOM screenX/screenY can change units when crossing different DPI screens.
      window.desktop.drag('move')
    }
    const up = (event: PointerEvent): void => {
      if (!down.current || event.pointerId !== down.current.pointerId) return
      trace({event:'handler.up',pointerId:event.pointerId,buttons:event.buttons})
      window.desktop.drag('release')
      down.current = null
      // Pointer capture ends after pointerup. Keep the character interactive until
      // its real pointerleave arrives as the window starts falling.
      window.desktop.pointer(true)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    const cancel = (event:PointerEvent): void => {
      if (!down.current || event.pointerId!==down.current.pointerId) return
      trace({event:'handler.cancel',pointerId:event.pointerId,buttons:event.buttons})
      window.desktop.drag('cancel')
      down.current = null; window.desktop.pointer(false)
    }
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('lostpointercapture', cancel)
    return () => {
      unsubscribeReset(); reset()
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel); window.removeEventListener('lostpointercapture', cancel)
    }
  }, [])
  if (!snapshot) return null
  return <div className="pet-surface" style={{ '--pet-size': `${snapshot.settings.size}px` } as React.CSSProperties}>
    {speech && <div key={`${speech.text}-${speech.until}`} className="pet-bubble" data-dialogue={speech.event} aria-live="polite">
      <span>{speech.text}</span>{speech.summary && <small>{speech.summary}</small>}
    </div>}
    <div className={`pet-character ${motion.state === 'held' ? 'held' : ''}`} data-motion={motion.state} data-surface={motion.surfaceId ?? undefined}
      style={{ transform: `scaleX(${-motion.direction})`, '--facing': -motion.direction } as React.CSSProperties}
      onPointerEnter={() => { window.desktop.pointer(true); greet() }}
      onPointerLeave={() => { if (!down.current) window.desktop.pointer(false) }}
      onPointerDown={event => {
        if (event.button !== 0) return
        trace({event:'handler.down',pointerId:event.pointerId,buttons:event.buttons})
        if(down.current) { trace({event:'stale.press',pointerId:down.current.pointerId}); window.desktop.drag('cancel'); down.current=null }
        setReaction(0)
        down.current = { pointerId: event.pointerId, target: event.currentTarget }
        // An invalid Chromium pointer ID must not abort the press before IPC.
        // The window follows the native cursor; window-level up/move still
        // finishes the press if native pointer capture cannot be established.
        try { event.currentTarget.setPointerCapture(event.pointerId) }
        catch(error) { trace({event:'capture.failed',pointerId:event.pointerId,error:captureError(error)}) }
        window.desktop.drag('start')
      }}
      onContextMenu={event => { event.preventDefault(); window.desktop.petMenu() }}>
      <span className="pet-shadow" aria-hidden="true"/>
      <div className={`pet-motion state-${motion.state} ${speech?.event === 'growth' ? 'celebrating' : ''} ${reaction ? 'petted' : ''}`} style={{
        '--sway': `${motion.tilt * -motion.direction}deg`, '--land-wide': 1 + motion.impact * 0.22,
        '--land-flat': 1 - motion.impact * 0.26, '--land-hop': `${4 + motion.impact * 7}px`
      } as React.CSSProperties}><Sprite id={speciesId(snapshot.game)} shiny={activePet(snapshot.game).shiny} eggType={activePet(snapshot.game).eggType}/></div>
      {reaction > 0 && <span key={reaction} className="pet-affection" aria-hidden="true"><i>♥</i><i>✦</i><i>♥</i></span>}
      {motion.state === 'landing' && <span className="pet-dust" aria-hidden="true"><i/><i/><i/><i/></span>}
    </div>
  </div>
}
function EggSelection({game,pace,busy,act}:{game:GameState;pace:Settings['pace'];busy:boolean;act:(action:GameAction)=>void}):React.JSX.Element {
  const legacy=game.pets.find(p=>p.phase===0 && p.eggType===null)
  return <section className="collection-panel"><div className="panel-heading"><h3>다음에 만날 친구</h3><p>알과 포켓몬을 바꿔도 성장 상태가 보관됩니다. 알에는 사탕을 사용할 수 없어요.</p></div>
    <div className="egg-grid">{EGG_TYPES.map(type=>{
      const egg=game.pets.find(p=>p.phase===0 && p.eggType===type.id),active=egg?.id===game.activeId
      const names=eggFamilies(type.id).map(f=>POKEMON.find(p=>p.id===FAMILIES[f].species[0])!.name).join(' · ')
      return <button key={type.id} className={`egg-choice ${active ? 'selected' : ''}`} aria-label={`${type.name} 알 선택`} disabled={busy || active} onClick={()=>act({type:'egg',eggType:type.id})}>
        <Egg type={type.id}/><strong>{type.name} 알</strong><small>{names}</small><span>{egg && egg.xp>0 ? `${(egg.xp/threshold(0,pace)*100).toFixed(1)}% 보관 중` : active ? '함께하는 중' : '선택하기'}</span>
      </button>
    })}</div>{legacy && <button className="button subtle" disabled={busy || legacy.id===game.activeId} onClick={()=>act({type:'select',petId:legacy.id,phase:0})}>기존 알 이어 키우기 · {(legacy.xp/threshold(0,pace)*100).toFixed(1)}%</button>}
  </section>
}
function CandyBox({game,pace,busy,act}:{game:GameState;pace:Settings['pace'];busy:boolean;act:(action:GameAction)=>void}):React.JSX.Element {
  const [amount,setAmount]=useState(1), count=candyCount(game),pet=activePet(game),canFeed=isGrowing(game)&&pet.phase>0
  const next=canFeed ? Math.ceil((threshold(pet.phase,pace)-pet.xp)/CANDY_XP) : 0
  return <section className="collection-panel candy-box"><div><h3>◈ 경험치사탕 <span data-testid="candy-count">{count.toLocaleString('ko-KR')}</span>개</h3><p>1개 = 10만 XP · 다음 사탕까지 {(CANDY_XP-game.candyTokens%CANDY_XP).toLocaleString('ko-KR')} 토큰</p>
    <p>{pet.phase===0 ? '알은 토큰으로만 부화해요.' : canFeed ? '토큰으로 자동 성장하며 사탕으로도 키울 수 있어요.' : '완성한 모습이에요. 새 토큰은 사탕으로 쌓입니다.'}</p></div>
    <div className="candy-actions"><label>먹일 개수 <input aria-label="먹일 사탕 개수" type="number" min="1" max={Math.max(1,count)} value={Math.min(amount,Math.max(1,count))} disabled={busy || !canFeed || !count} onChange={e=>setAmount(Math.max(1,Math.floor(Number(e.target.value)||1)))}/></label>
      <button className="button primary" disabled={busy || !canFeed || !count} onClick={()=>act({type:'candy',count:Math.min(amount,count)})}>사탕 먹이기</button>
      <button className="button subtle" disabled={busy || !canFeed || count<next} onClick={()=>act({type:'candy',count:next})}>다음 진화까지</button>
    </div></section>
}
function DexCard({game,pace,p,shiny,busy,act}:{game:GameState;pace:Settings['pace'];p:typeof POKEMON[number];shiny:boolean;busy:boolean;act:(action:GameAction)=>void}):React.JSX.Element {
  const [chosen,setChosen]=useState(''),choices=dexChoices(game,p.id,shiny)
  const pet=choices.find(c=>c.id===chosen) ?? choices.find(c=>c.id===game.activeId && game.displayPhase===p.phase) ?? choices[0]
  const active=pet?.id===game.activeId && game.displayPhase===p.phase, growing=pet?.phase===p.phase && pet.phase<finalPhase(pet)
  return <article className={`dex-card ${pet ? '' : 'locked'} ${active ? 'dex-selected' : ''}`} data-species={p.id} data-variant={shiny?'shiny':'normal'}><span className="dex-number">No. {String(p.id).padStart(3,'0')} {shiny ? '✦ 이로치' : ''}</span>
    {pet ? <Sprite id={p.id} shiny={shiny}/> : <div className="locked-placeholder">?</div>}<h3>{pet ? p.name : '아직 만나지 못했어요'}</h3>
    <div className="type-badges">{p.types.map(type=><span key={type} style={{background:EGG_TYPES.find(t=>t.id===type)?.color}}>{EGG_TYPES.find(t=>t.id===type)?.name}</span>)}</div>
    <span className="dex-badge">{pet ? growing ? `자동 성장 · ${(pet.xp/threshold(pet.phase,pace)*100).toFixed(1)}%` : '진화 완료 · 사탕 적립' : '미발견'}</span>
    {choices.length>1 && <select aria-label={`${p.name} 개체 선택`} value={pet.id} onChange={e=>setChosen(e.target.value)}>{choices.map((c,i)=><option key={c.id} value={c.id}>{i+1}번째 친구 · {c.phase===p.phase && c.phase<finalPhase(c) ? `${(c.xp/threshold(c.phase,pace)*100).toFixed(1)}% 성장` : '이 모습의 진화 완료'}</option>)}</select>}
    <button className="button primary" aria-label={`${shiny?'이로치 ':''}${p.name} 선택`} disabled={busy || !pet || active} onClick={()=>act({type:'select',petId:pet.id,phase:p.phase})}>{active ? '함께하는 중' : pet ? '함께하기' : '부화해서 만나기'}</button>
  </article>
}
function App(): React.JSX.Element {
  const snapshot = useSnapshot()
  const [tab, setTab] = useState('home')
  const [error, setError] = useState<string | null>(null)
  const [displays, setDisplays] = useState<DisplayChoice[]>([])
  const [busy, setBusy] = useState(false)
  const [shinyDex,setShinyDex]=useState(false)
  useEffect(() => window.desktop.onNavigate(setTab), [])
  useEffect(() => { if (tab === 'settings') void window.desktop.getDisplays().then(setDisplays) }, [tab])
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null); setBusy(true)
    try { await action() } catch (e) { setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '작업을 완료하지 못했습니다.') } finally { setBusy(false) }
  }
  const update = (patch: Partial<Settings>): void => { void run(() => window.desktop.updateSettings(patch)) }
  const act = (action: GameAction): void => { void run(() => window.desktop.gameAction(action)) }
  if (!snapshot) return <main className="loading"><Egg/><p>작은 친구를 깨우는 중…</p></main>
  const { game, settings } = snapshot
  const pet=activePet(game), growing=isGrowing(game), discovered=discoveredSpecies(game)
  const id = speciesId(game), name = id ? `${pet.shiny ? '✦ 이로치 ' : ''}${POKEMON.find(p => p.id === id)!.name}` : `${EGG_TYPES.find(t=>t.id===pet.eggType)?.name ?? '기존'} 알`
  const goal = growing ? threshold(pet.phase, settings.pace) : 0, progress = goal ? Math.min(100, pet.xp / goal * 100) : 100
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
          <section className="companion-card"><div className="card-top"><span className="pill">{pet.phase === 0 ? '부화를 기다리는 중' : growing ? `성장 단계 ${pet.phase} / ${finalPhase(pet)}` : '경험치사탕을 모으는 중'}</span><span className="small-label">MY COMPANION</span></div>
            <div className="habitat"><div className="cloud cloud-one"/><div className="cloud cloud-two"/><div className="sun"/><div className="hill hill-one"/><div className="hill hill-two"/><div className="ground"/><div className="habitat-sprite"><Sprite id={id} shiny={pet.shiny} eggType={pet.eggType}/></div><span className="grass grass-one">✧</span><span className="grass grass-two">✧</span></div>
            <div className="companion-description"><h2>{name}</h2><p>{pet.phase === 0 ? '어떤 친구가 태어날까요?' : growing ? '당신의 코딩 시간을 차곡차곡 기억하고 있어요.' : '이 모습으로 함께하며 다음 친구를 위한 사탕을 모아요.'}</p></div>
            <div className="growth"><div><strong>{growing ? `${labels[pet.phase]}까지` : '이 모습의 진화 완료'}</strong><span>{progress.toFixed(1)}%</span></div><div className="progress-track"><div style={{ width: `${progress}%` }}/></div><p>{growing ? <><span>{format(pet.xp)} / {format(goal)} XP</span><span>{format(Math.max(0, goal - pet.xp))} XP 남음</span></> : <span>알 또는 성장 중인 포켓몬을 고르면 자동 성장을 이어갑니다.</span>}</p></div>
            <div className="companion-actions"><button className="button primary" disabled={busy} onClick={() => update({ visible: !settings.visible })}>{settings.visible ? '데스크톱 펫 숨기기' : '데스크톱 펫 보이기'}</button><button className="button icon-button" title={settings.paused ? '다시 걷기' : '이동 일시정지'} aria-label={settings.paused ? '다시 걷기' : '이동 일시정지'} onClick={() => update({ paused: !settings.paused })}>{settings.paused ? '▷' : 'Ⅱ'}</button></div>
          </section>
          <div className="right-column"><section className="stat-card today-card"><span className="small-label">TODAY'S TOKENS</span><h2>{format(today)}<small>토큰</small></h2><p>오늘의 코딩이 남긴 발자국</p><div className="provider-breakdown"><span><i className="provider-dot claude"/>Claude Code <strong>{format(snapshot.usage.claude.today)}</strong></span><span><i className="provider-dot codex"/>Codex <strong>{format(snapshot.usage.codex.today)}</strong></span></div></section>
            <section className="stat-card"><span className="small-label">YOUR COLLECTION</span><div className="collection-stat"><strong>{discovered.length}<small> / {POKEMON.length}</small></strong><span>발견한 포켓몬 · 이로치 {game.ownedShiny.length}종</span></div><div className="mini-starters">{[1, 4, 7].map(n => <Sprite key={n} id={n} className={discovered.includes(n) ? '' : 'undiscovered'}/>)}</div><button className="text-button" onClick={() => setTab('dex')}>나의 도감 둘러보기 →</button></section>
          </div>
        </div>
        <CandyBox game={game} pace={settings.pace} busy={busy} act={act}/>
        <EggSelection game={game} pace={settings.pace} busy={busy} act={act}/>
        <section className="activity-strip"><div><span className="strip-icon">↗</span><div><span>전체 로컬 사용량</span><strong>{format(all)} 토큰</strong></div></div><div><span className="strip-icon">♡</span><div><span>연결 후 얻은 경험치</span><strong>{format(game.tokensEarned)} XP</strong></div></div><div><span className="strip-icon">✧</span><div><span>성장을 마친 친구</span><strong>{game.captures.length} 마리</strong></div></div></section>
        <footer className="home-footer"><span>{snapshot.notice ? `✦ ${snapshot.notice}` : '새로 쓰는 토큰으로 성장합니다. 기존 기록은 사용량에만 표시됩니다.'}</span><small>{snapshot.lastScan ? `${new Date(snapshot.lastScan).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 확인` : '첫 기록을 확인하는 중'}</small></footer>
      </>}
      {tab === 'dex' && <>
        <div className="page-heading"><div><h1>나의 작은 도감</h1><p>18개 진화 계열 · {discovered.length} / {POKEMON.length}종 발견 · 이로치 {game.ownedShiny.length}종</p></div><div className="segmented"><button className={!shinyDex ? 'selected' : ''} onClick={()=>setShinyDex(false)}>일반 도감</button><button className={shinyDex ? 'selected' : ''} onClick={()=>setShinyDex(true)}>✦ 이로치 도감</button></div></div>
        <CandyBox game={game} pace={settings.pace} busy={busy} act={act}/>
        <div className="dex-grid">{POKEMON.map(p=><DexCard key={`${p.id}:${shinyDex}`} game={game} pace={settings.pace} p={p} shiny={shinyDex} busy={busy} act={act}/>)}</div>
        <section className="history"><h3>최종 진화 기록</h3>{game.captures.length ? game.captures.slice(-20).reverse().map(c => <div key={c.petId}><span>{c.shiny ? '✦ 이로치 ' : ''}{POKEMON.find(p=>p.id===FAMILIES[c.family].species.at(-1))!.name}</span><small>{new Date(c.completedAt).toLocaleString('ko-KR')}</small></div>) : <p>첫 친구가 최종 진화하면 여기에 기록됩니다.</p>}</section>
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
