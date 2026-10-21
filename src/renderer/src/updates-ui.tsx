import React, { useEffect, useState } from 'react'
import { UpdateState, UpdateAction } from '../../shared/updates'
import { useI18n } from './i18n'
import { localizeMessage } from '../../shared/i18n'
import './updates.css'

export function UpdateHint({open}:{open:()=>void}):React.JSX.Element|null {
  const {t}=useI18n(),[state,setState]=useState<UpdateState|null>(null),[dismissed,setDismissed]=useState(false)
  useEffect(()=>{const remove=window.desktop.onUpdateState(setState);void window.desktop.getUpdateState().then(setState);return remove},[])
  if(dismissed||!state||!['available','downloaded'].includes(state.status))return null
  return <aside className="update-hint" aria-label={t('새 업데이트가 있어요')}><button onClick={()=>{setDismissed(true);open()}}>{state.status==='downloaded'?t('다운로드 완료. 재시작하면 업데이트돼요.'):t`새 버전 ${state.version}`} →</button><button aria-label={t('업데이트 알림 닫기')} onClick={()=>setDismissed(true)}>×</button></aside>
}

export function UpdateSettings():React.JSX.Element {
  const {t,language}=useI18n(),[state,setState]=useState<UpdateState|null>(null),[busy,setBusy]=useState(false)
  useEffect(()=>{const remove=window.desktop.onUpdateState(setState);void window.desktop.getUpdateState().then(setState);return remove},[])
  async function act(action:UpdateAction):Promise<void>{setBusy(true);try{await window.desktop.updateAction(action)}finally{setBusy(false)}}
  const working=busy||state?.status==='checking'||state?.status==='downloading'
  const labels:Record<string,string>={idle:'최신 버전을 확인해보세요.',checking:'업데이트를 확인하는 중…',current:'현재 사용할 수 있는 최신 버전이에요.',available:'새 버전이 준비됐어요.',downloading:'업데이트를 다운로드하는 중…',downloaded:'다운로드 완료. 재시작하면 업데이트돼요.',error:'업데이트를 확인하지 못했어요.'}
  return <section className="settings-card update-settings" aria-label={t('앱 업데이트')}><h2>{t('앱 업데이트')}</h2>
    {state&&<><div className="update-summary"><strong>{t`현재 버전 ${state.currentVersion}`}</strong>{state.version&&<span>{t`새 버전 ${state.version}`}</span>}</div>
      <p role="status">{state.mode==='development'?t('개발 실행에서는 자동 업데이트를 확인하지 않아요.'):state.error?localizeMessage(state.error,language):t(labels[state.status])}</p>
      {state.mode==='download'&&<p className="update-help">{t('이 실행 방식은 새 설치 파일을 다운로드해 적용해요. Windows 설치형은 앱 안에서 다운로드·재시작 업데이트를 지원해요.')}</p>}
      {state.status==='downloading'&&<progress aria-label={t('업데이트 다운로드 진행률')} max={100} value={state.percent}>{Math.floor(state.percent)}%</progress>}
      <div className="update-buttons"><button className="button subtle" disabled={working||state.mode==='development'||state.status==='downloaded'} onClick={()=>void act('check')}>{state.status==='checking'?t('확인 중…'):t('업데이트 확인')}</button>
        {state.status==='available'&&<button className="button primary" disabled={working} onClick={()=>void act(state.mode==='installer'?'download':'open')}>{state.mode==='installer'?t('업데이트 다운로드'):t('새 버전 다운로드 ↗')}</button>}
        {state.status==='downloaded'&&<button className="button primary" disabled={working} onClick={()=>void act('install')}>{t('저장하고 재시작하여 업데이트')}</button>}
      </div><small>{t('GitHub Releases에서 시작 시·6시간마다 확인해요. 프리뷰와 다른 OS의 배포는 건너뛰며, 자동으로 설치하거나 종료하지 않아요.')}</small>
    </>}
  </section>
}
