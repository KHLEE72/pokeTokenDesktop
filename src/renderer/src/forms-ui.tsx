import React, { useState } from 'react'
import { FAMILIES, FORMS, MEGA_STONES, nationalId, PokemonForm } from '../../shared/catalog'
import { activePet, appearanceId, appearancePhase, candyCount, dexChoices, finalPhase, speciesId } from '../../shared/game'
import { appearanceCollection, collectedAppearance, MEGA_CANDY_PRICE, megaOptions, megaUnlocked, stoneAvailable, stonePrice } from '../../shared/mega'
import { Companion, GameAction, Snapshot } from '../../shared/model'
import { eggName, localeFor, pokemonMatches, pokemonName, typeName } from '../../shared/i18n'
import { sortDex } from '../../shared/dex'
import { useI18n } from './i18n'
import { Sprite } from './sprites'

export function MegaPicker({snapshot,busy,act,openShop}:{snapshot:Snapshot;busy:boolean;act:(action:GameAction)=>void;openShop:()=>void}):React.JSX.Element|null {
  const {language,t}=useI18n(),game=snapshot.game,pet=activePet(game),id=speciesId(game)
  const options=id?megaOptions(id):[]
  if(!options.length||pet.phase!==game.displayPhase||pet.phase!==finalPhase(pet))return null
  return <div className="mega-picker"><select aria-label={t('메가진화 모습')} title={t('메가스톤은 도감의 모습·메가진화에서 해금할 수 있어요.')} disabled={busy} value={pet.mega??''} onChange={e=>act({type:'mega',formId:e.target.value?Number(e.target.value):null})}>
    <option value="">{t('원래 모습')}</option>{options.map(f=><option key={f.id} value={f.id} disabled={!megaUnlocked(game,f.id)}>{pokemonName(f.id,language)}{megaUnlocked(game,f.id)?'':t(' · 미해금')}</option>)}
  </select><button type="button" className="text-button" onClick={openShop} aria-label={t('메가스톤 상점 열기')}>◇</button></div>
}
function FormCard({form,snapshot,shiny,busy,act}:{form:PokemonForm;snapshot:Snapshot;shiny:boolean;busy:boolean;act:(action:GameAction)=>void}):React.JSX.Element {
  const {language,t}=useI18n(),game=snapshot.game,[chosen,setChosen]=useState('')
  const mega=form.kind==='mega',base=mega?form.baseAppearanceId!:form.id
  const choices=dexChoices(game,base,shiny),pet=choices.find(p=>p.id===chosen)??choices.find(p=>p.id===game.activeId)??choices[0]
  const unlocked=mega&&megaUnlocked(game,form.id),collected=collectedAppearance(game,form.id,shiny)
  const active=Boolean(pet?.id===game.activeId&&appearanceId(game)===form.id)
  const stone=MEGA_STONES.find(s=>s.id===form.stone),available=mega&&stoneAvailable(game,form.stone!),price=stonePrice(game)
  const phase=(p:Companion):number=>appearancePhase(p,base)
  return <article className={`form-card ${active?'form-active':''} ${collected?'form-collected':''}`} data-form={form.id} data-kind={form.kind}>
    <div className="form-card-top"><span>No. {String(form.speciesId).padStart(3,'0')}</span><span>{mega?t('메가진화'):form.kind==='regional'?t('리전폼'):t('특별한 모습')}</span></div>
    <Sprite id={form.id} shiny={shiny}/><h3 title={pokemonName(form.id,language)}>{pokemonName(form.id,language)}</h3>
    <div className="type-badges">{form.types.map(type=><span key={type}>{typeName(type,language)}</span>)}</div>
    <p className="form-status">{collected?t('도감 등록'):t('미발견')}{mega&&unlocked?` · ${t('영구 해금')}`:''}</p>
    {mega?<><p className="stone-name">{stone?.names[language]}{stone?.kind==='technique'&&<small>{t('기술 해금')}</small>}<small>{t`필요한 모습: ${pokemonName(base,language)}`}</small></p>{!unlocked&&<button className="button subtle" disabled={busy||!available||candyCount(game)<price} onClick={()=>act({type:'mega-stone',stone:form.stone!})}>{!available?t('기본 모습을 먼저 만나주세요'):price===0?t('첫 1개 무료 선택'):t`사탕 ${price}개로 영구 해금`}</button>}</>:<p className="form-route">{pet?t('성장 기록 보관 중'):t`시작 알: ${FAMILIES[form.family].eggTypes.map(type=>eggName(type,language)).join(' · ')}`}</p>}
    {choices.length>1&&<select aria-label={t`${pokemonName(form.id,language)} 개체 선택`} value={pet.id} onChange={e=>setChosen(e.target.value)}>{choices.map((p,i)=><option key={p.id} value={p.id}>{t`${i+1}번째 친구`}</option>)}</select>}
    <button className="button primary" disabled={busy||!pet||active||(mega&&!unlocked)} onClick={()=>mega?act({type:'mega',formId:form.id,petId:pet.id}):act({type:'select',petId:pet.id,phase:phase(pet)})}>{active?t('함께하는 중'):pet?t('함께하기'):t('아직 만나지 못했어요')}</button>
  </article>
}
export function FormCollection({snapshot,busy,act,selectedSpecies,clearSpecies}:{snapshot:Snapshot;busy:boolean;act:(action:GameAction)=>void;selectedSpecies:number|null;clearSpecies:()=>void}):React.JSX.Element {
  const {language,t}=useI18n(),[kind,setKind]=useState('all'),[search,setSearch]=useState(''),[page,setPage]=useState(1),[shiny,setShiny]=useState(false)
  const game=snapshot.game,collection=appearanceCollection(game),query=search.normalize('NFKC').replace(/\s/g,'').toLowerCase()
  const filtered=sortDex(FORMS.filter(f=>(!selectedSpecies||f.speciesId===selectedSpecies)&&(kind==='all'||f.kind===kind||f.region===kind)&&(!query||pokemonMatches(f.id,query)||String(nationalId(f.id))===query.replace(/^(no\.?|#)/,''))),snapshot.settings.dexSort,game,shiny,language)
  const pages=Math.max(1,Math.ceil(filtered.length/9)),current=Math.min(page,pages),items=filtered.slice((current-1)*9,current*9)
  return <section className="forms-page" role="tabpanel" id="dex-forms" aria-labelledby="dex-forms-tab">
    <div className="form-shop-summary"><div><strong>{t('리전폼과 메가진화')}</strong><p>{t`첫 메가스톤 1개는 무료, 이후에는 사탕 ${MEGA_CANDY_PRICE.toLocaleString(localeFor(language))}개로 영구 해금해요.`}</p><small>{t('일반·이로치와 같은 종의 모든 개체가 해금을 공유해요.')}</small></div><div><strong>{t`사탕 ${candyCount(game).toLocaleString(localeFor(language))}개`}</strong><small>{collection.freeMegaStoneUsed?t`메가 해금 ${collection.megaStones.length}개`:t('첫 무료 선택이 남아 있어요')}</small></div></div>
    <div className="form-filters"><input type="search" aria-label={t('모습 이름 또는 도감 번호 검색')} placeholder={t('모습 이름 또는 도감 번호 검색')} value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/>
      <select aria-label={t('모습 종류')} value={kind} onChange={e=>{setKind(e.target.value);setPage(1)}}>{[['all','모든 모습'],['regional','리전폼'],['mega','메가진화'],['special','특별한 모습'],['alola','알로라'],['galar','가라르'],['hisui','히스이'],['paldea','팔데아']].map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select>
      <button className="button subtle" aria-pressed={shiny} onClick={()=>setShiny(!shiny)}>{shiny?t('✦ 이로치 도감'):t('일반 도감')}</button>
      {selectedSpecies&&<button className="text-button" onClick={()=>{clearSpecies();setPage(1)}}>{t('전체 모습 보기')}</button>}
    </div>
    <p className="form-count" role="status">{t`${filtered.length}개 모습 · ${current} / ${pages} 페이지`} · {t('도감 등록')} {(shiny?collection.ownedShiny:collection.owned).length}/{FORMS.length}</p>
    <div className="form-grid">{items.map(form=><FormCard key={`${form.id}-${shiny}`} form={form} snapshot={snapshot} shiny={shiny} busy={busy} act={act}/>)}</div>
    {!items.length&&<p className="forms-empty">{t('조건에 맞는 모습이 없어요.')}</p>}
    {pages>1&&<nav className="form-pagination" aria-label={t('모습 페이지 이동')}><button className="button subtle" disabled={current===1} onClick={()=>setPage(current-1)}>{t('← 이전')}</button><select aria-label={t('이동할 모습 페이지')} value={current} onChange={e=>setPage(Number(e.target.value))}>{Array.from({length:pages},(_,i)=><option key={i+1} value={i+1}>{i+1} / {pages}</option>)}</select><button className="button subtle" disabled={current===pages} onClick={()=>setPage(current+1)}>{t('다음 →')}</button></nav>}
    <p className="form-notes">{t('리전폼은 각 모습의 진화 경로를 따릅니다. 메가진화는 성장을 바꾸지 않으며 새 토큰은 사탕으로 모여요.')}</p>
  </section>
}
