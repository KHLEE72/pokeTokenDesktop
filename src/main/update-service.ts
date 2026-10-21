import { app, net, shell } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { UpdateController, UpdateBackend, findUpdate } from './updates'
import { UPDATE_REPOSITORY, UpdateState } from '../shared/updates'

export function createUpdates(publish:(state:UpdateState)=>void,beforeInstall:()=>Promise<void>):UpdateController {
  const test=process.env.POKETOKEN_TEST_MODE==='1'
  const installed=process.platform==='win32'&&!process.env.PORTABLE_EXECUTABLE_FILE&&existsSync(join(dirname(app.getPath('exe')),'Uninstall PokeToken Desktop.exe'))
  const mode=!app.isPackaged&&!test?'development':installed?'installer':'download'
  let backend:UpdateBackend|undefined
  if(mode==='installer') {
    // Load only in the installed Windows app. Portable and ad-hoc signed Macs
    // still receive version notifications and a link to their own OS build.
    const {autoUpdater}=require('electron-updater') as typeof import('electron-updater')
    autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false
    autoUpdater.allowPrerelease=false;autoUpdater.allowDowngrade=false;autoUpdater.channel='latest'
    autoUpdater.disableWebInstaller=true
    autoUpdater.logger=null
    autoUpdater.on('error',error=>controller.installationFailed(error))
    backend={
      async check(){const result=await autoUpdater.checkForUpdates();return result?.isUpdateAvailable?result.updateInfo.version:null},
      async download(progress){const listener=(value:{percent:number}):void=>progress(value.percent);autoUpdater.on('download-progress',listener);try{await autoUpdater.downloadUpdate()}finally{autoUpdater.removeListener('download-progress',listener)}},
      install(){autoUpdater.quitAndInstall(false,true)}
    }
  }
  const controller=new UpdateController(app.getVersion(),mode,{
    publish,backend,beforeInstall,open:url=>shell.openExternal(url),
    async latest(){
      if(test&&process.env.POKETOKEN_UPDATE_FIXTURE)return findUpdate(JSON.parse(readFileSync(process.env.POKETOKEN_UPDATE_FIXTURE,'utf8')),app.getVersion(),process.platform,process.arch)
      try {
        const response=await net.fetch(`https://api.github.com/repos/${UPDATE_REPOSITORY.owner}/${UPDATE_REPOSITORY.repo}/releases?per_page=50`,{headers:{Accept:'application/vnd.github+json','User-Agent':'PokeToken-Desktop'},signal:AbortSignal.timeout(15_000)})
        if(response.status===404)throw new Error('공개된 업데이트 정보를 찾을 수 없어요. 저장소 공개 상태와 릴리스를 확인해주세요.')
        if(response.status===403||response.status===429)throw new Error('GitHub 요청이 많아요. 잠시 후 다시 확인해주세요.')
        if(!response.ok)throw new Error('네트워크 연결을 확인한 뒤 다시 시도해주세요.')
        const text=await response.text();if(text.length>4_000_000)throw new Error('업데이트 정보를 읽지 못했어요.')
        return findUpdate(JSON.parse(text),app.getVersion(),process.platform,process.arch)
      }catch(error){if(error instanceof Error&&/^(공개된|GitHub|업데이트)/.test(error.message))throw error;throw new Error('네트워크 연결을 확인한 뒤 다시 시도해주세요.')}
    }
  })
  return controller
}
