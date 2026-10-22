import React, { useMemo, useState } from 'react'
import { Snapshot } from '../../shared/model'
import { LEAGUE_SERIES, LEAGUE_GOALS, LEAGUE_BY_ID, LeagueDisplay, LeagueGoal, leagueProgress, newLeague, registeredSpecies } from '../../shared/league'
import { pokemonName, pokemonMatches } from '../../shared/i18n'
import { useI18n } from './i18n'
import { Sprite } from './sprites'
import badgeArt from '../../shared/badge-art-catalog.json'
import './league.css'

const colors:Record<string,string>={rock:'#aa9074',water:'#57aee1',electric:'#f5c64c',grass:'#6fba71',poison:'#b879c8',psychic:'#f18aaa',fire:'#ed8b53',ground:'#d4ad62',flying:'#a9b8e8',bug:'#a7bd5e',normal:'#c6bca5',ghost:'#9b8bd1',fighting:'#d56b62',steel:'#a9bac8',ice:'#79cdd7',dragon:'#7d94df',dark:'#817689',fairy:'#e9a4c8'}
const badgeGoals:Record<string,string>=badgeArt.goals
const badgeImages:Record<string,{pixel:boolean}>=badgeArt.assets
export function LeagueIcon({goal,locked=false}:{goal:LeagueGoal;locked?:boolean}):React.JSX.Element {
  const color=colors[goal.type]??'#cfaa5c'
  if(goal.kind==='title')return <svg viewBox="0 0 64 64" className={`league-icon ${locked?'locked':''}`} aria-hidden="true"><path d="M10 21 23 31 32 13 41 31 54 21 48 48H16Z" fill="#e7ba5b" stroke="#795e38" strokeWidth="2"/><path d="M20 48H44V54H20Z" fill="#b8863f"/><path d="M27 35 32 28 37 35 32 42Z" fill={color}/><path d="M15 20 24 33M33 18 38 31" stroke="#fff5cf" strokeWidth="3"/></svg>
  const art=badgeGoals[goal.id]
  return <img className={`league-icon badge-icon ${locked?'locked':''}`} src={`./badges/${art}.png`} data-badge-art={art} style={{imageRendering:badgeImages[art]?.pixel?'pixelated':'auto'}} alt="" aria-hidden="true" draggable={false}/>
}
export function HomeHonors({snapshot,open,location='home'}:{snapshot:Snapshot;open:()=>void;location?:'home'|'sidebar'}):React.JSX.Element|null {
  const {language,t}=useI18n(),state=snapshot.league??newLeague(),title=state.title?LEAGUE_BY_ID.get(state.title):undefined
  const badges=state.badges.map(id=>LEAGUE_BY_ID.get(id)).filter((g):g is LeagueGoal=>Boolean(g))
  if(!badges.length&&!title)return null
  return <button className={`home-honors honors-${location}`} onClick={open} aria-label={t('배지와 칭호 전시 설정')} title={[title?.names[language],...badges.map(g=>g.names[language])].filter(Boolean).join(' · ')}>
    {title&&<span className="home-title"><LeagueIcon goal={title}/><span>{title.names[language]}</span></span>}
    {badges.length>0&&<span className="home-badges">{badges.map(goal=><span key={goal.id} data-honor={goal.id} title={goal.names[language]}><LeagueIcon goal={goal}/></span>)}</span>}
  </button>
}
export function LeagueCollection({snapshot,busy,save}:{snapshot:Snapshot;busy:boolean;save:(display:LeagueDisplay)=>Promise<void>}):React.JSX.Element {
  const {language,t}=useI18n(),state=snapshot.league??newLeague()
  const [series,setSeries]=useState('all'),[kind,setKind]=useState('badge'),[status,setStatus]=useState('all'),[query,setQuery]=useState(''),[page,setPage]=useState(1),[message,setMessage]=useState('')
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set())
  const registered=useMemo(()=>registeredSpecies(snapshot.game),[snapshot.game])
  const filtered=LEAGUE_GOALS.filter(goal=>{
    if(goal.kind!==kind||series!=='all'&&goal.series!==series||status==='owned'&&!state.unlocked[goal.id]||status==='missing'&&state.unlocked[goal.id])return false
    const q=query.normalize('NFKC').trim().toLowerCase()
    return !q||Object.values(goal.names).some(n=>n.toLowerCase().includes(q))||goal.parties.some(p=>Object.values(p.trainer).some(n=>n.toLowerCase().includes(q))||p.species.some(id=>String(id)===q||pokemonMatches(id,q)))
  })
  const pages=Math.max(1,Math.ceil(filtered.length/9)),current=Math.min(page,pages)
  async function change(display:LeagueDisplay):Promise<void>{setMessage('');try{await save(display)}catch{setMessage(t('전시 설정을 저장하지 못했어요. 다시 시도해주세요.'))}}
  function toggle(goal:LeagueGoal):void {
    if(goal.kind==='title'){void change({badges:state.badges,title:state.title===goal.id?null:goal.id});return}
    if(!state.badges.includes(goal.id)&&state.badges.length===8){setMessage(t('배지는 최대 8개까지 전시할 수 있어요. 먼저 하나를 해제해주세요.'));return}
    void change({badges:state.badges.includes(goal.id)?state.badges.filter(id=>id!==goal.id):[...state.badges,goal.id],title:state.title})
  }
  function move(id:string,to:number):void {const badges=state.badges.filter(value=>value!==id);badges.splice(to,0,id);void change({badges,title:state.title})}
  const badgeCount=LEAGUE_GOALS.filter(g=>g.kind==='badge'&&state.unlocked[g.id]).length,titleCount=LEAGUE_GOALS.filter(g=>g.kind==='title'&&state.unlocked[g.id]).length
  return <section className="league-page" aria-label={t('배지와 리그 칭호')}>
    <div className="page-heading"><div><h1>{t('여행의 증표')}</h1><p>{t('도감에 모은 친구들로, 각 지방의 리그에 도전해요.')}</p></div><span className="league-tally">{t`배지 ${badgeCount} · 칭호 ${titleCount}`}</span></div>
    <section className="honor-display" aria-label={t('나의 전시대')}>
      <div className="honor-display-heading"><h2>{t('나의 전시대')}</h2><span>{t('배지 최대 8개 · 칭호 1개')}</span></div>
      <div className="honor-slots">{Array.from({length:8},(_,index)=>{
        const goal=LEAGUE_BY_ID.get(state.badges[index])
        return <div key={index} className={`honor-slot ${goal?'filled':''}`} draggable={Boolean(goal)&&!busy} onDragStart={e=>{if(goal)e.dataTransfer.setData('text/plain',goal.id)}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain');if(!busy&&state.badges.includes(id))move(id,Math.min(index,state.badges.length-1))}}>
          {goal?<><button className="honor-remove" disabled={busy} aria-label={t`${goal.names[language]} 전시 해제`} onClick={()=>toggle(goal)} title={goal.names[language]}><LeagueIcon goal={goal}/></button><div className="honor-move"><button disabled={busy||index===0} aria-label={t`${index+1}번째 배지 왼쪽으로`} onClick={()=>move(goal.id,index-1)}>‹</button><button disabled={busy||index===state.badges.length-1} aria-label={t`${index+1}번째 배지 오른쪽으로`} onClick={()=>move(goal.id,index+1)}>›</button></div></>:<span>{String(index+1).padStart(2,'0')}</span>}
        </div>
      })}</div>
      <label className="honor-title-select"><span>{t('전시할 칭호')}</span><select value={state.title??''} disabled={busy} onChange={e=>void change({badges:state.badges,title:e.target.value||null})}><option value="">{t('칭호 전시 안 함')}</option>{LEAGUE_GOALS.filter(g=>g.kind==='title'&&state.unlocked[g.id]).map(g=><option key={g.id} value={g.id}>{g.names[language]} · {LEAGUE_SERIES.find(s=>s.id===g.series)!.names[language]}</option>)}</select></label>
      <p>{t('배지를 끌거나 화살표로 순서를 바꾸고, 누르면 전시를 해제해요.')}</p>
    </section>
    {message&&<p role="status" className="league-message">{message}</p>}
    <p className="league-rules">{t('일반·이로치·리전폼·메가폼 중 하나라도 등록한 종은 인정해요. 같은 종은 한 번만 필요하고, 획득한 증표는 영구 보관돼요.')}</p>
    <div className="league-filters">
      <div className="segmented" aria-label={t('증표 종류')}><button aria-pressed={kind==='badge'} className={kind==='badge'?'selected':''} onClick={()=>{setKind('badge');setPage(1)}}>{t('배지')}</button><button aria-pressed={kind==='title'} className={kind==='title'?'selected':''} onClick={()=>{setKind('title');setPage(1)}}>{t('리그 칭호')}</button></div>
      <select aria-label={t('작품 선택')} value={series} onChange={e=>{setSeries(e.target.value);setPage(1)}}><option value="all">{t('모든 작품')}</option>{LEAGUE_SERIES.map(s=><option key={s.id} value={s.id}>{s.names[language]}</option>)}</select>
      <select aria-label={t('획득 상태')} value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="all">{t('전체')}</option><option value="owned">{t('획득 완료')}</option><option value="missing">{t('도전 중')}</option></select>
      <input aria-label={t('배지·트레이너·포켓몬 검색')} placeholder={t('배지·트레이너·포켓몬 검색')} value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/>
    </div>
    <div className="league-pagination"><span role="status">{t`${filtered.length}개 증표 · ${current} / ${pages} 페이지`}</span><button className="button subtle" disabled={current===1} onClick={()=>setPage(current-1)}>{t('이전')}</button><button className="button subtle" disabled={current===pages} onClick={()=>setPage(current+1)}>{t('다음')}</button></div>
    <div className="league-grid">{filtered.slice((current-1)*9,current*9).map(goal=>{
      const progress=leagueProgress(goal,registered),unlocked=Boolean(state.unlocked[goal.id]),selected=goal.kind==='badge'?state.badges.includes(goal.id):state.title===goal.id
      return <article key={goal.id} className={`league-card ${unlocked?'earned':''} ${selected?'on-display':''}`} data-league={goal.id}>
        <div className="league-card-head"><LeagueIcon goal={goal} locked={!unlocked}/><span>{LEAGUE_SERIES.find(s=>s.id===goal.series)!.names[language]}</span><small>{unlocked?t('획득 완료'):t('도전 중')}</small></div>
        <h2>{goal.names[language]}</h2><p className="league-trainers">{[...new Set(goal.parties.map(p=>p.trainer[language]))].join(' · ')}</p>
        <div className="progress-track" role="progressbar" aria-label={goal.names[language]} aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.owned.length}><i style={{width:`${100*progress.owned.length/progress.total}%`}}/></div>
        <p>{t`${progress.owned.length} / ${progress.total}종 등록`}</p>
        <details className="league-requirements" onToggle={event=>{const open=event.currentTarget.open;setExpanded(previous=>{const next=new Set(previous);if(open)next.add(goal.id);else next.delete(goal.id);return next})}}><summary>{t('요구 파티와 출처')}</summary>{expanded.has(goal.id)&&goal.parties.map((party,index)=><div key={index} className="league-party"><strong>{party.trainer[language]}</strong><small>{t(party.basis)}</small><div className="party-pokemon">{party.species.map(id=><span key={id} className={registered.has(id)?'registered':''}><Sprite id={id}/><span>{registered.has(id)?'✓ ':''}{pokemonName(id,language)}</span></span>)}</div><button className="text-button" onClick={()=>void window.desktop.openLeagueSource(goal.id,index)}>{t('파티 출처 열기 ↗')}</button></div>)}</details>
        <button className={`button ${selected?'subtle':'primary'}`} aria-pressed={selected} disabled={busy||!unlocked} onClick={()=>toggle(goal)}>{selected?t('전시 해제'):unlocked?t('메인에 전시'):t`${progress.missing.length}종 더 모으기`}</button>
      </article>
    })}</div>
    {filtered.length===0&&<p className="league-empty">{t('조건에 맞는 증표가 없어요.')}</p>}
    <p className="league-footnote">{t('재대결·최종 강화 파티를 우선하며, 없으면 초전을 사용해요. 버전·스타팅별 변형은 합쳐서 집계하고, 알로라의 시련 증표는 이 앱의 수집 보상이에요.')}</p>
  </section>
}
