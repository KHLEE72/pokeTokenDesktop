import { describe, expect, it, vi } from 'vitest'
import { LoginStart } from '../src/main/login-start'

function fixture(platform='win32',portable:string|undefined='C:\\내 앱 [test]\\PokeToken-1.1.0.exe'){
  let registered='',args:string[]=[],enabled=true
  const api={
    getLoginItemSettings:vi.fn((value:{path:string;args:string[]})=>({openAtLogin:registered===value.path&&JSON.stringify(args)===JSON.stringify(value.args),executableWillLaunchAtLogin:registered===value.path&&enabled,launchItems:registered===value.path?[{enabled}]:[]})),
    setLoginItemSettings:vi.fn((value:{path?:string;args?:string[];openAtLogin?:boolean;enabled?:boolean})=>{registered=value.openAtLogin?value.path! : '';args=value.args??[];enabled=value.enabled??true})
  }
  const login=new LoginStart(api,platform,true,'C:\\Temp\\extract\\PokeToken Desktop.exe','C:\\Temp\\extract\\resources\\app.asar',portable)
  return {api,login,setDisabled:()=>{enabled=false}}
}
describe('login startup registration',()=>{
  it('registers the outer portable EXE with hidden args and queries exactly the same path/arguments',()=>{
    const {api,login}=fixture();expect(login.set(true)).toBe('enabled')
    expect(api.setLoginItemSettings).toHaveBeenCalledWith({path:'C:\\내 앱 [test]\\PokeToken-1.1.0.exe',args:['--hidden'],openAtLogin:true,enabled:true})
    expect(api.getLoginItemSettings).toHaveBeenLastCalledWith(login.options)
    expect(login.set(false)).toBe('missing');expect(api.setLoginItemSettings).toHaveBeenLastCalledWith({...login.options,openAtLogin:false,enabled:false})
  })
  it('repairs a missing or moved path at next launch only when the saved preference is on',()=>{
    const {api,login}=fixture();expect(login.restore(false)).toBe('missing');expect(api.setLoginItemSettings).not.toHaveBeenCalled()
    expect(login.restore(true)).toBe('enabled');api.setLoginItemSettings.mockClear()
    expect(login.restore(true)).toBe('enabled');expect(api.setLoginItemSettings).not.toHaveBeenCalled()
    const moved=new LoginStart(api,'win32',true,'temp','app','D:\\new folder\\renamed.exe')
    expect(moved.restore(true)).toBe('enabled');expect(api.setLoginItemSettings).toHaveBeenLastCalledWith({...moved.options,openAtLogin:true,enabled:true})
  })
  it('respects Task Manager disabling, but explicit re-registration enables it again',()=>{
    const {api,login,setDisabled}=fixture();login.set(true);setDisabled();api.setLoginItemSettings.mockClear()
    expect(login.restore(true)).toBe('disabled');expect(api.setLoginItemSettings).not.toHaveBeenCalled()
    expect(login.set(true)).toBe('enabled')
  })
  it('uses the installed executable and keeps Windows-only flags away from macOS',()=>{
    const {api,login}=fixture('darwin','');expect(login.set(true)).toBe('enabled')
    expect(api.setLoginItemSettings).toHaveBeenCalledWith({path:'C:\\Temp\\extract\\PokeToken Desktop.exe',args:['--hidden'],openAtLogin:true})
  })
  it('does not report a working entry as disabled because an older duplicate is disabled',()=>{
    const {api,login}=fixture()
    api.getLoginItemSettings.mockReturnValue({openAtLogin:true,executableWillLaunchAtLogin:true,launchItems:[{enabled:false},{enabled:true}]})
    expect(login.restore(true)).toBe('enabled');expect(api.setLoginItemSettings).not.toHaveBeenCalled()
  })
  it('does not silently save success when OS registration fails or remains missing',()=>{
    const {api,login}=fixture();api.setLoginItemSettings.mockImplementation(()=>{})
    expect(()=>login.set(true)).toThrow('등록하지 못했어요')
    api.getLoginItemSettings.mockImplementation(()=>{throw Error('denied')});expect(login.read()).toBe('error')
    expect(()=>login.set(true)).toThrow('등록하지 못했어요')
  })
  it('test mode never touches real OS login settings, and an unpackaged development app cannot register itself',()=>{
    const {api}=fixture(),test=new LoginStart(api,'win32',true,'exe','app','portable',true)
    expect(test.set(true)).toBe('enabled');expect(test.restore(true)).toBe('enabled');test.set(false)
    expect(api.setLoginItemSettings).not.toHaveBeenCalled();expect(api.getLoginItemSettings).not.toHaveBeenCalled()
    const dev=new LoginStart(api,'win32',false,'electron.exe','app with spaces',undefined)
    expect(dev.read()).toBe('unsupported');expect(()=>dev.set(true)).toThrow('설치형')
  })
})
