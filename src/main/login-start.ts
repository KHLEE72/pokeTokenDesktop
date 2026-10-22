import type { Settings } from 'electron'
import type { Snapshot } from '../shared/model'

type Status=NonNullable<Snapshot['startup']>
interface LoginAPI {
  setLoginItemSettings(value:Settings):void
  getLoginItemSettings(value:{path:string;args:string[]}):{openAtLogin:boolean;executableWillLaunchAtLogin?:boolean;status?:string;launchItems?:{enabled:boolean}[]}
}
// Always point at the outer portable launcher, never its temporary extraction.
export class LoginStart {
  private simulated=false
  readonly options:{path:string;args:string[]}
  constructor(private api:LoginAPI,private platform:string,private packaged:boolean,executable:string,appPath:string,portable:string|undefined,private test=false){
    this.options={path:portable||executable,args:packaged?['--hidden']:[`"${appPath}"`,'--hidden']}
  }
  read():Status {
    if(this.test)return this.simulated?'enabled':'missing'
    if(!this.packaged||!['win32','darwin'].includes(this.platform))return 'unsupported'
    try{
      const state=this.api.getLoginItemSettings(this.options)
      if(state.status==='requires-approval')return 'disabled'
      if(state.openAtLogin&&(this.platform!=='win32'||state.executableWillLaunchAtLogin!==false))return 'enabled'
      return state.launchItems?.some(item=>!item.enabled)?'disabled':'missing'
    }catch{return 'error'}
  }
  set(enabled:boolean):Status {
    if(this.test){this.simulated=enabled;return this.read()}
    if(!this.packaged||!['win32','darwin'].includes(this.platform))throw Error('자동 시작은 설치형 또는 Portable 앱에서 설정해주세요.')
    this.api.setLoginItemSettings({...this.options,openAtLogin:enabled,...(this.platform==='win32'?{enabled}:{})})
    const status=this.read()
    if(status==='error'||enabled&&status==='missing')throw Error('자동 시작을 등록하지 못했어요. 파일 위치와 운영체제의 시작 앱 설정을 확인해주세요.')
    return status
  }
  restore(enabled:boolean):Status {
    const status=this.read()
    // Repair a moved/renamed portable path, while respecting an OS opt-out.
    return enabled&&status==='missing'?this.set(true):status
  }
}
