import { gt, valid, rcompare } from 'semver'
import { UpdateMode, UpdateState, UPDATE_REPOSITORY } from '../shared/updates'

export interface Release { tag_name: string; draft?: boolean; prerelease?: boolean; assets?: { name: string; browser_download_url: string }[] }
export interface AvailableUpdate { version: string; url: string }
export function findUpdate(releases: unknown, current: string, platform: string, arch: string): AvailableUpdate | null {
  if (!Array.isArray(releases) || !valid(current)) throw new Error('업데이트 정보를 읽지 못했어요.')
  const candidates = releases.filter((r): r is Release => r && typeof r.tag_name === 'string' && !r.draft && !r.prerelease && Boolean(valid(r.tag_name.replace(/^v/, ''))) && !r.tag_name.includes('-'))
    .sort((a,b)=>rcompare(a.tag_name.replace(/^v/,''),b.tag_name.replace(/^v/,'')))
  for (const release of candidates) {
    const version=release.tag_name.replace(/^v/,'')
    if (!gt(version,current)) continue
    const names=platform==='win32'?[`PokeToken-Desktop-${version}-Setup-${arch}.exe`,`PokeToken-Desktop-${version}-win-${arch}.exe`]:platform==='darwin'?[`PokeToken-Desktop-${version}-mac-${arch}.dmg`]:[]
    const asset=names.map(name=>release.assets?.find(a=>a.name===name)).find(Boolean)
    if (!asset) continue // Windows and Mac releases may be published on different dates.
    const prefix=`https://github.com/${UPDATE_REPOSITORY.owner}/${UPDATE_REPOSITORY.repo}/releases/download/${encodeURIComponent(release.tag_name)}/`
    if (asset.browser_download_url!==prefix+encodeURIComponent(asset.name)) throw new Error('업데이트 다운로드 주소를 확인하지 못했어요.')
    return {version,url:asset.browser_download_url}
  }
  return null
}
export interface UpdateBackend {
  check(): Promise<string | null>
  download(progress: (percent:number)=>void): Promise<void>
  install(): void
}
export class UpdateController {
  state: UpdateState
  private url: string | null=null
  private busy=false
  private lastCheck=-Infinity
  constructor(version:string,mode:UpdateMode,private dependencies:{
    latest:()=>Promise<AvailableUpdate|null>; backend?:UpdateBackend
    publish:(state:UpdateState)=>void; open:(url:string)=>Promise<unknown>
    beforeInstall:()=>Promise<void>; now?:()=>number
  }) {this.state={mode,status:'idle',currentVersion:version,version:null,percent:0,checkedAt:null,error:null}}
  private update(patch:Partial<UpdateState>):void {this.state={...this.state,...patch};this.dependencies.publish({...this.state})}
  private fail(error:unknown):void {this.update({status:'error',percent:0,error:error instanceof Error&&['공개된 업데이트 정보를 찾을 수 없어요. 저장소 공개 상태와 릴리스를 확인해주세요.','GitHub 요청이 많아요. 잠시 후 다시 확인해주세요.','네트워크 연결을 확인한 뒤 다시 시도해주세요.','업데이트 정보를 읽지 못했어요.','업데이트 다운로드 주소를 확인하지 못했어요.'].includes(error.message)?error.message:'업데이트를 완료하지 못했어요. 잠시 후 다시 시도해주세요.'})}
  async check():Promise<void> {
    if(this.busy||this.state.status==='downloaded'||this.state.mode==='development')return
    const now=(this.dependencies.now??Date.now)()
    if(now-this.lastCheck<60_000)return
    this.lastCheck=now;this.busy=true;this.update({status:'checking',error:null})
    try {
      if(this.dependencies.backend){const version=await this.dependencies.backend.check();this.url=null;this.update({status:version?'available':'current',version,checkedAt:new Date(now).toISOString(),percent:0})}
      else {const release=await this.dependencies.latest();this.url=release?.url??null;this.update({status:release?'available':'current',version:release?.version??null,checkedAt:new Date(now).toISOString(),percent:0})}
    }catch(error){this.fail(error)}finally{this.busy=false}
  }
  async download():Promise<void> {
    if(this.busy||this.state.status!=='available'||!this.dependencies.backend)return
    this.busy=true;this.update({status:'downloading',percent:0,error:null})
    try {await this.dependencies.backend.download(percent=>{if(Number.isFinite(percent))this.update({percent:Math.max(0,Math.min(100,percent))})});this.update({status:'downloaded',percent:100})}
    catch(error){this.fail(error)}finally{this.busy=false}
  }
  async install():Promise<void> {
    if(this.busy||this.state.status!=='downloaded'||!this.dependencies.backend)return
    this.busy=true
    try {await this.dependencies.beforeInstall();this.dependencies.backend.install()}
    catch(error){this.fail(error);this.busy=false}
  }
  installationFailed(error:unknown):void {if(this.busy&&this.state.status==='downloaded'){this.busy=false;this.fail(error)}}
  async open():Promise<void> {if(this.state.mode==='download'&&this.state.status==='available'&&this.url)await this.dependencies.open(this.url)}
}
