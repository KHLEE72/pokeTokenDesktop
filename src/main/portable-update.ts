import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, copyFile, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import type { AvailableUpdate, UpdateBackend } from './updates'

export async function fileSha256(path:string):Promise<string> {
  const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex')
}
export interface PortableUpdateOptions {
  root:string; executable:string; helper:string; version:string
  latest:()=>Promise<AvailableUpdate|null>; fetch:typeof fetch; quit:()=>void
  testPort?:number
}
export function portableHelperCommand(powershell:string,helper:string,config:string,directory:string):string {
  const literal=(value:string):string=>`'${value.replaceAll("'","''")}'`
  const args=`-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${helper}" -ConfigPath "${config}"`
  return `$ErrorActionPreference='Stop';$start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=${literal(powershell)};$start.Arguments=${literal(args)};$start.WorkingDirectory=${literal(directory)};$start.UseShellExecute=$true;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden;[void][Diagnostics.Process]::Start($start)`
}
export class PortableUpdateBackend implements UpdateBackend {
  private release:AvailableUpdate|null=null
  private prepared:{directory:string;file:string}|null=null
  constructor(private options:PortableUpdateOptions){}
  async check():Promise<string|null>{this.release=await this.options.latest();this.prepared=null;return this.release?.version??null}
  async download(progress:(percent:number)=>void):Promise<void>{
    const release=this.release
    if(!release?.sha256?.match(/^[a-f0-9]{64}$/)||!Number.isSafeInteger(release.size)||release.size!<2||release.size!>600_000_000)throw Error('업데이트 파일의 검증 정보를 확인하지 못했어요.')
    if(this.prepared&&await fileSha256(this.prepared.file).catch(()=>null)===release.sha256){progress(100);return}
    await mkdir(this.options.root,{recursive:true})
    const directory=join(this.options.root,randomUUID()),file=join(directory,'download.exe')
    await mkdir(directory)
    try{
      const response=await this.options.fetch(release.url,{signal:AbortSignal.timeout(10*60_000)})
      if(!response.ok||!response.body)throw Error('Download failed')
      const handle=await open(file,'wx'),reader=response.body.getReader(),hash=createHash('sha256')
      let bytes=0
      try{
        for(;;){
          const {done,value}=await reader.read();if(done)break
          bytes+=value.length;if(bytes>release.size!)throw Error('업데이트 파일이 손상됐어요. 다시 다운로드해주세요.')
          hash.update(value);await handle.writeFile(value);progress(bytes/release.size!*100)
        }
        if(bytes!==release.size||hash.digest('hex')!==release.sha256)throw Error('업데이트 파일이 손상됐어요. 다시 다운로드해주세요.')
        await handle.sync()
      }finally{await reader.cancel().catch(()=>{});reader.releaseLock();await handle.close()}
      const header=await open(file,'r');try{const magic=Buffer.alloc(2);await header.read(magic,0,2,0);if(magic.toString()!=='MZ')throw Error('업데이트 파일이 손상됐어요. 다시 다운로드해주세요.')}finally{await header.close()}
      this.prepared={directory,file};progress(100)
    }catch(error){await rm(directory,{recursive:true,force:true});throw error}
  }
  async install():Promise<void>{
    if(!this.prepared||!this.release)throw Error('No verified portable update')
    const target=this.options.executable,{directory,file}=this.prepared,token=directory.split(/[\\/]/).at(-1)!
    if(!isAbsolute(target)||!target.toLowerCase().endsWith('.exe')||resolve(target)===resolve(file))throw Error('Invalid portable executable')
    try{await access(target,constants.R_OK|constants.W_OK);const probe=join(dirname(target),`.poketoken-write-${token}`);await writeFile(probe,'',{flag:'wx'});await rm(probe)}
    catch{throw Error('EXE가 있는 폴더에 쓸 수 없어요. 쓰기 가능한 폴더로 옮긴 뒤 다시 시도해주세요.')}
    const helper=join(directory,'replace.ps1'),config=join(directory,'config.json'),status=join(directory,'status.json')
    await copyFile(this.options.helper,helper)
    await writeFile(config,JSON.stringify({target,source:file,sha256:this.release.sha256,version:this.release.version,previousVersion:this.options.version,token,parentPid:process.pid,testPort:this.options.testPort}),{flag:'wx'})
    const log=await open(join(directory,'helper.log'),'a')
    // ShellExecute gives the real helper an independent hidden console. A
    // directly spawned helper can be closed with Electron's console, whereas
    // DETACHED_PROCESS can make Windows PowerShell skip its script entirely.
    const powershell=join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe')
    const command=Buffer.from(portableHelperCommand(powershell,helper,config,directory),'utf16le').toString('base64')
    const child=spawn(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',command],{windowsHide:true,cwd:directory,stdio:['ignore',log.fd,log.fd]})
    let exited=false
    child.once('exit',code=>{exited=code!==0})
    const spawned=new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)})
    try{await spawned}finally{await log.close()}
    child.unref()
    // Do not quit until the helper has copied and verified the sibling file.
    // A permissions/hash/spawn failure leaves the running app intact.
    const deadline=Date.now()+60_000
    while(Date.now()<deadline){
      const state=await readFile(status,'utf8').then(text=>JSON.parse(text) as {status:string}).catch(()=>null)
      if(state?.status==='ready'){this.options.quit();return}
      if(state?.status==='failed'||exited)throw Error('Portable update preparation failed')
      await new Promise(resolve=>setTimeout(resolve,100))
    }
    // Cancelling before shutdown also prevents a delayed helper from replacing.
    await writeFile(join(directory,'cancel'),'')
    throw Error('Portable update helper did not become ready')
  }
}

export async function acknowledgePortableUpdate(root:string,executable:string,version:string,args:string[]):Promise<void>{
  const token=args.find(arg=>/^--poketoken-update=[a-f0-9-]{36}$/.test(arg))?.split('=')[1]
  if(!token)return
  const directory=join(root,token),config=JSON.parse(await readFile(join(directory,'config.json'),'utf8'))
  if(config.token!==token||config.version!==version||resolve(config.target).toLowerCase()!==resolve(executable).toLowerCase())return
  await writeFile(join(directory,'healthy'),token,{flag:'wx'})
}
export async function portableUpdateRecovered(root:string,executable:string,args:string[]):Promise<boolean>{
  const token=args.find(arg=>/^--poketoken-update-recovery=[a-f0-9-]{36}$/.test(arg))?.split('=')[1]
  if(!token)return false
  const directory=join(root,token),config=JSON.parse(await readFile(join(directory,'config.json'),'utf8')),status=JSON.parse(await readFile(join(directory,'status.json'),'utf8'))
  return config.token===token&&resolve(config.target).toLowerCase()===resolve(executable).toLowerCase()&&status.status==='rolled-back'
}
