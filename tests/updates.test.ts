import { describe,expect,it,vi } from 'vitest'
import { findUpdate,UpdateController,UpdateBackend } from '../src/main/updates'
const asset=(version:string,os='win-x64.exe')=>({name:`PokeToken-Desktop-${version}-${os}`,browser_download_url:`https://github.com/KHLEE72/pokeTokenShimeji/releases/download/v${version}/PokeToken-Desktop-${version}-${os}`})
const release=(version:string,os='win-x64.exe')=>({tag_name:`v${version}`,assets:[asset(version,os)]})
describe('serverless updates',()=>{
  it('uses semver and only published stable releases with the current OS and architecture',()=>{
    const rows=[{...release('3.0.0'),draft:true},{...release('2.0.0-preview.1'),prerelease:true},release('1.10.0','mac-arm64.dmg'),release('1.9.0'),release('1.2.0')]
    expect(findUpdate(rows,'1.0.0','win32','x64')?.version).toBe('1.9.0')
    expect(findUpdate(rows,'1.0.0','darwin','arm64')?.version).toBe('1.10.0');expect(findUpdate(rows,'1.0.0','darwin','x64')).toBeNull()
    expect(findUpdate(rows,'9.0.0','win32','x64')).toBeNull();expect(findUpdate([release('1.0.0')],'1.0.0-preview.2','win32','x64')?.version).toBe('1.0.0')
  })
  it('prefers the installer for portable upgrades and rejects redirected/external asset addresses',()=>{
    const row=release('2.0.0');row.assets.push(asset('2.0.0','Setup-x64.exe'));expect(findUpdate([row],'1.0.0','win32','x64')?.url).toContain('Setup-x64.exe')
    for(const url of ['https://evil.example/setup.exe','http://github.com/KHLEE72/pokeTokenShimeji/releases/download/v2.0.0/setup.exe','https://github.com/KHLEE72/other/releases/download/v2.0.0/setup.exe']){
      const bad=release('2.0.0');bad.assets[0].browser_download_url=url;expect(()=>findUpdate([bad],'1.0.0','win32','x64')).toThrow()
    }
  })
  it('deduplicates concurrent checks, rate-limits checks and opens only its verified release asset',async()=>{
    let now=0,resolve!:(value:{version:string;url:string})=>void
    const latest=vi.fn(()=>new Promise<{version:string;url:string}>(r=>resolve=r)),open=vi.fn(async()=>{}),publish=vi.fn()
    const controller=new UpdateController('1.0.0','download',{latest,open,publish,beforeInstall:async()=>{},now:()=>now})
    const check=controller.check();await controller.check();expect(latest).toHaveBeenCalledTimes(1);expect(controller.state.status).toBe('checking')
    resolve({version:'2.0.0',url:'https://github.com/example/verified'});await check;await controller.download();await controller.install();expect(controller.state.status).toBe('available')
    await controller.open();expect(open).toHaveBeenCalledWith('https://github.com/example/verified');await controller.check();expect(latest).toHaveBeenCalledTimes(1)
    now=60_001;const retry=controller.check();resolve({version:'2.0.0',url:'https://github.com/example/verified'});await retry;expect(latest).toHaveBeenCalledTimes(2)
  })
  it('downloads only on request, saves before explicit installation and never installs on a plain check',async()=>{
    const order:string[]=[],backend:UpdateBackend={check:vi.fn(async()=> '2.0.0'),download:vi.fn(async progress=>{progress(49);progress(101)}),install:vi.fn(()=>{order.push('install')})}
    const controller=new UpdateController('1.0.0','installer',{latest:async()=>null,backend,publish:()=>{},open:async()=>{},beforeInstall:async()=>{order.push('saved')}})
    await controller.install();await controller.check();expect(backend.download).not.toHaveBeenCalled();expect(backend.install).not.toHaveBeenCalled()
    await controller.download();expect(controller.state.status).toBe('downloaded');expect(controller.state.percent).toBe(100);expect(backend.install).not.toHaveBeenCalled()
    await controller.install();expect(order).toEqual(['saved','install'])
    controller.installationFailed(new Error('late installer spawn failure'));expect(controller.state.status).toBe('error')
  })
  it('keeps the app usable on network/download/save failure without installing or exposing raw errors',async()=>{
    let failDownload=true,now=0
    const install=vi.fn(),controller=new UpdateController('1.0.0','installer',{latest:async()=>null,backend:{check:async()=> '2.0.0',download:async()=>{if(failDownload)throw new Error('secret internal path')},install},publish:()=>{},open:async()=>{},beforeInstall:async()=>{throw new Error('disk full')},now:()=>now})
    await controller.check();await controller.download();expect(controller.state.status).toBe('error');expect(controller.state.error).not.toContain('secret');expect(install).not.toHaveBeenCalled()
    failDownload=false;now=60_001;await controller.check();await controller.download();await controller.install();expect(controller.state.status).toBe('error');expect(install).not.toHaveBeenCalled()
    const offline=new UpdateController('1.0.0','download',{latest:async()=>{throw new Error('네트워크 연결을 확인한 뒤 다시 시도해주세요.')},publish:()=>{},open:async()=>{},beforeInstall:async()=>{}})
    await offline.check();expect(offline.state.status).toBe('error');expect(offline.state.error).toContain('네트워크')
  })
})
