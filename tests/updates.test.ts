import { describe,expect,it,vi } from 'vitest'
import { findUpdate,UpdateController,UpdateBackend } from '../src/main/updates'
const asset=(version:string,os='win-x64.exe')=>({name:`PokeToken-Desktop-${version}-${os}`,browser_download_url:`https://github.com/KHLEE72/pokeTokenDesktop/releases/download/v${version}/PokeToken-Desktop-${version}-${os}`})
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
    for(const url of ['https://evil.example/setup.exe','http://github.com/KHLEE72/pokeTokenDesktop/releases/download/v2.0.0/setup.exe','https://github.com/KHLEE72/other/releases/download/v2.0.0/setup.exe']){
      const bad=release('2.0.0');bad.assets[0].browser_download_url=url;expect(()=>findUpdate([bad],'1.0.0','win32','x64')).toThrow()
    }
  })
  it('portable updates select only the matching portable EXE and require a GitHub SHA-256 and size',()=>{
    const row={...release('2.0.0'),assets:[{...asset('2.0.0'),digest:`sha256:${'a'.repeat(64)}`,size:1000},asset('2.0.0','Setup-x64.exe')]}
    expect(findUpdate([row],'1.0.0','win32','x64',true)).toMatchObject({version:'2.0.0',sha256:'a'.repeat(64),size:1000,url:asset('2.0.0').browser_download_url})
    expect(findUpdate([release('2.0.0','Setup-x64.exe')],'1.0.0','win32','x64',true)).toBeNull()
    expect(()=>findUpdate([release('2.0.0')],'1.0.0','win32','x64',true)).toThrow('검증 정보')
    for(const size of [-1,0,600_000_001,1.5])expect(()=>findUpdate([{...row,assets:[{...row.assets[0],size}]}],'1.0.0','win32','x64',true)).toThrow()
  })
  it('one explicit apply downloads, flushes and awaits portable replacement, while a failed download cannot quit',async()=>{
    const order:string[]=[],backend:UpdateBackend={check:async()=> '2.0.0',download:async()=>{order.push('download')},install:async()=>{await Promise.resolve();order.push('replace')}}
    const controller=new UpdateController('1.0.0','portable',{latest:async()=>null,backend,publish:()=>{},open:async()=>{},beforeInstall:async()=>{order.push('flush')}})
    await controller.check();expect(order).toEqual([]);await controller.apply();expect(order).toEqual(['download','flush','replace']);expect(controller.state.status).toBe('installing')
    const broken=new UpdateController('1.0.0','portable',{latest:async()=>null,backend:{...backend,download:async()=>{throw Error('Network lost')}},publish:()=>{},open:async()=>{},beforeInstall:async()=>{order.push('bad flush')}})
    await broken.check();await broken.apply();expect(broken.state.status).toBe('error');expect(order).toEqual(['download','flush','replace'])
  })
  it('accepts an update pressed as the available event is published and limits progress notifications',async()=>{
    let applying:Promise<void>|undefined;const install=vi.fn(),publish=vi.fn((state)=>{if(state.status==='available')applying=controller.apply()})
    const controller=new UpdateController('1.0.0','portable',{latest:async()=>null,backend:{check:async()=> '2.0.0',download:async progress=>{for(let i=0;i<=10_000;i++)progress(i/100)},install},publish,open:async()=>{},beforeInstall:async()=>{}})
    await controller.check();await applying;expect(install).toHaveBeenCalledTimes(1);expect(publish.mock.calls.filter(([state])=>state.status==='downloading').length).toBeLessThanOrEqual(101)
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
