import { _electron as electronApp, expect } from './test-electron.mjs'
import electron from 'electron'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { currentPet } from './current-pet.mjs'

const directory=mkdtempSync(join(tmpdir(),'poketoken-session-')),checks=[],errors=[],windows=[]
const env={...process.env,POKETOKEN_DATA_DIR:directory,POKETOKEN_TEST_MODE:'1',POKETOKEN_WINDOW_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE
const windowsRepair=process.platform==='win32'
const logPath=join(directory,'diagnostics/pet-input.jsonl')
const rows=()=>{try{return readFileSync(logPath,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))}catch{return[]}}
let application,pet
try{
  application=await electronApp.launch({executablePath:process.env.POKETOKEN_EXE||electron,args:[...(process.env.POKETOKEN_EXE?[]:['.']),'--hidden'],env,timeout:60000})
  await application.firstWindow();pet=await currentPet(application)
  const dashboard=application.windows().find(page=>page.url().includes('view=dashboard'))
  const power=name=>application.evaluate(({powerMonitor},name)=>powerMonitor.emit(name),name)
  const identity=()=>application.evaluate(({BrowserWindow})=>{
    const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet'))
    return{id:w.id,handle:w.getNativeWindowHandle().toString('hex'),visible:w.isVisible(),focused:w.isFocused(),focusable:w.isFocusable(),bounds:w.getContentBounds()}
  })
  const watch=page=>page.on('pageerror',error=>errors.push(error.message));watch(pet)
  await expect.poll(()=>pet.evaluate(async()=>Boolean((await window.desktop.getSnapshot()).lastScan))).toBe(true)
  const logs=join(directory,'logs');mkdirSync(logs);const usageFile=join(logs,'usage.jsonl');writeFileSync(usageFile,'')
  const displayId=await application.evaluate(({screen})=>String(screen.getAllDisplays().at(-1).id))
  await pet.evaluate(({logs,displayId})=>window.desktop.updateSettings({paused:true,size:96,displayId,roots:{claude:[logs],codex:[]}}),{logs,displayId})
  writeFileSync(usageFile,JSON.stringify({type:'assistant',timestamp:new Date(Date.now()+1000).toISOString(),requestId:'session',message:{id:'growth',usage:{input_tokens:650000}}})+'\n')
  await pet.evaluate(()=>window.desktop.refresh())
  const baseline=await pet.evaluate(()=>window.desktop.getSnapshot())
  expect(baseline.game.tokensEarned).toBe(650000)
  await dashboard.evaluate(()=>{globalThis.sessionPanelState='keep-management-renderer'})
  const managementId=await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=dashboard')).id)
  await application.evaluate(({BrowserWindow,screen,Menu})=>{
    screen.getCursorScreenPoint=()=>{const b=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).getContentBounds();return{x:b.x+70,y:b.y+116}}
    const build=Menu.buildFromTemplate.bind(Menu)
    Menu.buildFromTemplate=template=>{if(template.some(item=>item.label==='펫 입력 복구'))globalThis.sessionTray=template;return build(template)}
  })
  // Capture the actual tray callback through the normal settings publication.
  await pet.evaluate(()=>window.desktop.updateSettings({paused:true}))
  const manual=()=>application.evaluate(()=>globalThis.sessionTray.find(item=>item.label==='펫 입력 복구').click())
  const assertSaved=async()=>{
    const s=await pet.evaluate(()=>window.desktop.getSnapshot())
    expect(s.game).toEqual(baseline.game);expect(s.settings.size).toBe(96);expect(s.settings.displayId).toBe(displayId)
    expect(await dashboard.evaluate(()=>globalThis.sessionPanelState)).toBe('keep-management-renderer')
    expect(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=dashboard')).id)).toBe(managementId)
    const w=await identity();expect(w.focused).toBe(false);expect(w.focusable).toBe(false);expect(w.bounds.width).toBe(144);expect(w.bounds.height).toBe(176)
    windows.push(w)
  }
  const click=async()=>{
    await pet.mouse.move(70,116);await pet.mouse.down();await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','held')
    await pet.mouse.up();await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','idle')
    await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-dialogue','petting')
  }
  const initial=await identity();windows.push(initial)
  if(windowsRepair){
    // This injects a window-specific delivery fault. It is not a substitute for
    // physically locking Windows: the real user's secure desktop is untouched.
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).webContents.on('before-mouse-event',(event,input)=>{if(input.type==='mouseDown')event.preventDefault()}))
    await pet.mouse.move(70,116);await pet.mouse.down();await pet.mouse.up()
    await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','idle')
    checks.push('an injected old-window mouse-down fault prevents grabbing while the pet renderer remains alive')
  }
  await power('lock-screen');await power('lock-screen');await power('suspend');await power('resume')
  expect((await identity()).visible).toBe(false)
  await power('unlock-screen');await power('unlock-screen')
  pet=await currentPet(application,pet);watch(pet)
  if(windowsRepair){expect((await identity()).id).not.toBe(initial.id);expect((await identity()).handle).not.toBe(initial.handle)}
  else expect((await identity()).id).toBe(initial.id)
  await click();await assertSaved()
  checks.push('overlapping lock/resume/unlock notifications restore input, retain growth/settings/management state and keep the pet unfocused')
  if(windowsRepair){await expect.poll(()=>rows().filter(row=>row.event==='pet.rebuild-complete').length).toBe(1);checks.push('one new native HWND retires the faulted page and clears its window-specific input fault')}
  const beforeManual=await identity();await manual();await manual()
  pet=await currentPet(application,pet);watch(pet)
  if(windowsRepair){expect((await identity()).handle).not.toBe(beforeManual.handle);await expect.poll(()=>rows().filter(row=>row.event==='pet.rebuild-complete').length).toBe(2)}
  await click();await assertSaved()
  checks.push('the actual tray input-repair callback coalesces repeated requests and restores click/grab without restarting the application')
  await pet.evaluate(()=>window.desktop.updateSettings({visible:false}))
  const hidden=pet
  await power('lock-screen');await power('unlock-screen')
  pet=await currentPet(application,hidden);watch(pet)
  expect((await identity()).visible).toBe(false);await assertSaved()
  await dashboard.evaluate(()=>window.desktop.updateSettings({visible:true}));expect((await identity()).visible).toBe(true)
  await click()
  checks.push('a hidden pet stays hidden across repair and can be shown and interacted with afterwards')
  // The window is already ready, but its 250ms log batch may still be pending.
  await expect.poll(()=>rows().filter(row=>row.event==='pet.rebuild-complete').length).toBe(windowsRepair?3:0)
  const completed=rows().filter(row=>row.event==='pet.rebuild-complete').length
  await manual();await application.close();application=null
  expect(rows().filter(row=>row.event==='pet.rebuild-complete').length).toBe(completed)
  expect(rows().at(-1).event).toBe('session.end');expect(errors).toEqual([])
  checks.push('quitting during the repair debounce cancels the new window and flushes the final log record')
  mkdirSync('artifacts',{recursive:true})
  writeFileSync('artifacts/session-report.json',JSON.stringify({checks,errors,windows,windowsRepair,realWindowsLockValidated:false,logPath,executablePath:process.env.POKETOKEN_EXE||electron},null,2))
  console.log(JSON.stringify({checks,errors,windowsRepair,realWindowsLockValidated:false},null,2))
}finally{if(application)await application.close()}
