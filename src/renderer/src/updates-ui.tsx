import React, { useEffect, useRef, useState } from 'react'
import { UpdateState, UpdateAction } from '../../shared/updates'
import { useI18n } from './i18n'
import { localizeMessage } from '../../shared/i18n'
import { PixelIcon } from './pixel-icons'
import './updates.css'

function useUpdateState():UpdateState|null {
  const [state,setState]=useState<UpdateState|null>(null)
  useEffect(()=>{const remove=window.desktop.onUpdateState(setState);void window.desktop.getUpdateState().then(setState);return remove},[])
  return state
}
export function UpdateHint({open}:{open:()=>void}):React.JSX.Element|null {
  const {t}=useI18n(),state=useUpdateState(),[dismissed,setDismissed]=useState(false)
  if(dismissed||!state||!['available','downloaded'].includes(state.status))return null
  return <aside className="update-hint" aria-label={t('새 업데이트가 있어요')}><button onClick={()=>{setDismissed(true);open()}}>{state.status==='downloaded'?t('다운로드 완료. 재시작하면 업데이트돼요.'):t`새 버전 ${state.version}`} →</button><button aria-label={t('업데이트 알림 닫기')} onClick={()=>setDismissed(true)}>×</button></aside>
}
function UpdateDialog({state,busy,act,close}:{state:UpdateState|null;busy:boolean;act:(action:UpdateAction)=>Promise<void>;close:()=>void}):React.JSX.Element {
  const {t,language}=useI18n(),dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{dialog.current?.showModal()},[])
  const working=busy||['checking','downloading','installing'].includes(state?.status??'')
  const labels:Record<string,string>={idle:'최신 버전을 확인해보세요.',checking:'업데이트를 확인하는 중…',current:'현재 사용할 수 있는 최신 버전이에요.',available:'새 버전이 준비됐어요.',downloading:'업데이트를 다운로드하는 중…',downloaded:'다운로드 완료. 재시작하면 업데이트돼요.',installing:'진행 상태를 저장하고 업데이트를 적용하는 중…',error:'업데이트를 확인하지 못했어요.'}
  return <dialog ref={dialog} className="update-dialog" aria-labelledby="update-title" onCancel={close} onClose={close}>
    <div className="update-dialog-heading"><h2 id="update-title">{t('앱 업데이트')}</h2><button className="text-button" aria-label={t('닫기')} onClick={close}>×</button></div>
    {state&&<><div className="update-summary"><strong>{t`현재 버전 ${state.currentVersion}`}</strong>{state.version&&<span>{t`새 버전 ${state.version}`}</span>}</div>
      <p role="status">{state.mode==='development'?t('개발 실행에서는 자동 업데이트를 확인하지 않아요.'):state.error?localizeMessage(state.error,language):t(labels[state.status])}</p>
      {state.mode==='portable'&&<p className="update-help">{t('새 포터블 EXE를 검증한 뒤 현재 파일을 교체하고 재실행해요. 도감·성장·설정은 유지돼요.')}</p>}
      {state.mode==='download'&&<p className="update-help">{t('새 버전을 다운로드한 뒤 직접 교체해주세요.')}</p>}
      {state.status==='downloading'&&<progress aria-label={t('업데이트 다운로드 진행률')} max={100} value={state.percent}>{Math.floor(state.percent)}%</progress>}
      <div className="update-buttons"><button className="button subtle" disabled={working||state.mode==='development'||state.status==='downloaded'} onClick={()=>void act('check')}>{state.status==='checking'?t('확인 중…'):t('업데이트 확인')}</button>
        {state.status==='available'&&<button className="button primary" disabled={working} onClick={()=>void act(state.mode==='download'?'open':'apply')}>{state.mode==='download'?t('새 버전 다운로드 ↗'):t('업데이트하고 재시작')}</button>}
        {state.status==='downloaded'&&<button className="button primary" disabled={working} onClick={()=>void act('install')}>{t('저장하고 재시작하여 업데이트')}</button>}
      </div><small>{t('GitHub Releases에서 시작 시·6시간마다 확인해요. 프리뷰와 다른 OS의 배포는 건너뛰며, 자동으로 설치하거나 종료하지 않아요.')}</small>
    </>}
  </dialog>
}
export function SidebarUpdate({open,show,close}:{open:boolean;show:()=>void;close:()=>void}):React.JSX.Element {
  const {t}=useI18n(),state=useUpdateState(),[busy,setBusy]=useState(false)
  useEffect(()=>{if(state?.error==='업데이트를 적용하지 못해 이전 버전으로 복구했어요. 다시 시도해주세요.')show()},[state?.error])
  async function act(action:UpdateAction):Promise<void>{setBusy(true);try{await window.desktop.updateAction(action)}finally{setBusy(false)}}
  return <div className="sidebar-updates">
    <button className="sidebar-update" aria-haspopup="dialog" onClick={()=>{show();void act('check')}}><PixelIcon kind="update"/><span>{t('업데이트 확인')}</span>{state&&['available','downloaded'].includes(state.status)&&<i className="update-dot" aria-label={t('새 업데이트가 있어요')}/>}</button>
    {open&&<UpdateDialog state={state} busy={busy} act={act} close={close}/>}
  </div>
}
