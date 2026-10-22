import { useMemo, useState } from 'react'
import type { AutoHatchConfig, EggType, GameAction, GameState } from '../../shared/model'
import { EGG_TYPES } from '../../shared/catalog'
import { autoHatchTargets } from '../../shared/game'
import { eggName, localeFor, pokemonMatches, pokemonName } from '../../shared/i18n'
import { useI18n } from './i18n'
import './auto-hatch.css'

export function AutoHatchPanel({game,busy,act}:{game:GameState;busy:boolean;act:(action:GameAction)=>void}):React.JSX.Element {
  const {language,t}=useI18n(),auto=game.autoHatch
  const [type,setType]=useState<AutoHatchConfig['eggType']>(auto?.eggType??'random')
  const [targeted,setTargeted]=useState(Boolean(auto?.targetId))
  const [target,setTarget]=useState(auto?.targetId??null)
  const [variant,setVariant]=useState<AutoHatchConfig['variant']>(auto?.variant??'any')
  const [search,setSearch]=useState('')
  const candidates=useMemo(()=>type==='random'?[]:autoHatchTargets(type).sort((a,b)=>pokemonName(a,language).localeCompare(pokemonName(b,language),localeFor(language))),[type,language])
  const query=search.normalize('NFKC').replace(/\s/g,'').toLowerCase()
  const visible=candidates.filter(id=>id===target||!query||pokemonMatches(id,query)||String(id)===query)
  const running=Boolean(auto?.enabled)
  return <section className="auto-hatch" aria-label={t('자동 부화')}>
    <div className="auto-hatch-heading"><div><h3>{t('자동 부화')}</h3><p>{t('부화한 친구는 모두 보관해요. 다른 알이나 포켓몬을 직접 고르면 자동 부화가 중지됩니다.')}</p></div>
      <span className="auto-hatch-state" role="status">{running?t`자동 부화 중 · ${auto!.hatched}회`:auto?.matchedPetId?t('목표 달성!'):t('대기 중')}</span></div>
    <div className="auto-hatch-controls">
      <label>{t('부화할 알')}<select aria-label={t('자동 부화 알 선택')} disabled={busy||running} value={type} onChange={e=>{setType(e.target.value as EggType|'random');setTarget(null);setSearch('');if(e.target.value==='random')setTargeted(false)}}>
        <option value="random">{t('랜덤 알')}</option>{EGG_TYPES.map(type=><option key={type.id} value={type.id}>{eggName(type.id,language)}</option>)}
      </select></label>
      {type!=='random'&&<label>{t('부화 목표')}<select aria-label={t('자동 부화 목표 방식')} disabled={busy||running} value={targeted?'target':'random'} onChange={e=>setTargeted(e.target.value==='target')}><option value="random">{t('랜덤 포켓몬')}</option><option value="target">{t('타겟 포켓몬')}</option></select></label>}
      {type!=='random'&&targeted&&<>
        <label>{t('타겟 검색')}<input aria-label={t('자동 부화 타겟 검색')} disabled={busy||running} value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('이름 또는 도감 번호')} /></label>
        <label>{t('타겟 포켓몬')}<select aria-label={t('자동 부화 타겟 포켓몬')} disabled={busy||running} value={target??''} onChange={e=>setTarget(Number(e.target.value)||null)}><option value="">{t('부화 가능한 포켓몬 선택')}</option>{visible.map(id=><option key={id} value={id}>{pokemonName(id,language)}</option>)}</select></label>
        <label>{t('모습 조건')}<select aria-label={t('자동 부화 모습 조건')} disabled={busy||running} value={variant} onChange={e=>setVariant(e.target.value as AutoHatchConfig['variant'])}><option value="any">{t('상관없음')}</option><option value="normal">{t('일반')}</option><option value="shiny">{t('이로치')}</option></select></label>
      </>}
    </div>
    <div className="auto-hatch-footer"><p>{t('남는 토큰은 다음 알로 이월해요. 목표를 만나면 중지하고 그 친구의 성장을 이어갑니다.')}</p><button className={`button ${running?'subtle':'primary'}`} disabled={busy||!running&&type!=='random'&&targeted&&!target} onClick={()=>act({type:'auto-hatch',config:running?null:{eggType:type,targetId:type!=='random'&&targeted?target:null,variant}})}>{running?t('자동 부화 중지'):t('자동 부화 시작')}</button></div>
    {auto?.matchedPetId&&<p className="auto-hatch-success">{t('자동 부화 목표 달성! 함께할 친구를 만났어요.')} {auto.targetId?pokemonName(auto.targetId,language):''}</p>}
  </section>
}
