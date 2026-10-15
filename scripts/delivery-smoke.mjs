import { _electron as electronApp, expect } from '@playwright/test'
import electron from 'electron'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { currentPet } from './current-pet.mjs'

if(process.platform!=='win32'){console.log('Windows native-input recovery smoke test: not applicable on this platform.');process.exit(0)}
const directory=mkdtempSync(join(tmpdir(),'poketoken-delivery-')),logs=join(directory,'logs')
mkdirSync(logs);const usageFile=join(logs,'usage.jsonl');writeFileSync(usageFile,'')
const logPath=join(directory,'diagnostics/pet-input.jsonl'),checks=[],errors=[],windows=[]
const env={...process.env,POKETOKEN_DATA_DIR:directory,POKETOKEN_TEST_MODE:'1'}
delete env.ELECTRON_RUN_AS_NODE;delete env.POKETOKEN_WINDOW_TEST
const rows=()=>{try{return readFileSync(logPath,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))}catch{return[]}}
let application,pet
try{
  application=await electronApp.launch({executablePath:process.env.POKETOKEN_EXE||electron,args:[...(process.env.POKETOKEN_EXE?[]:['.']),'--hidden'],env,timeout:60000})
  await application.firstWindow();pet=await currentPet(application)
  const dashboard=application.windows().find(page=>page.url().includes('view=dashboard'))
  const watch=page=>page.on('pageerror',error=>errors.push(error.message));watch(pet)
  await expect.poll(()=>pet.evaluate(async()=>Boolean((await window.desktop.getSnapshot()).lastScan))).toBe(true)
  await pet.evaluate(logs=>window.desktop.updateSettings({paused:true,size:96,theme:'light',roots:{claude:[logs],codex:[]}}),logs)
  writeFileSync(usageFile,JSON.stringify({type:'assistant',timestamp:new Date().toISOString(),requestId:'delivery',message:{id:'grow',usage:{input_tokens:1650000}}})+'\n')
  await pet.evaluate(()=>window.desktop.refresh())
  expect((await pet.evaluate(()=>window.desktop.getSnapshot())).game.tokensEarned).toBe(1650000)
  await dashboard.evaluate(async()=>{const s=await window.desktop.getSnapshot();await window.desktop.gameAction({type:'ball',petId:s.game.activeId,ball:'great'})})
  await dashboard.evaluate(()=>{globalThis.deliveryPanelState='keep-dashboard'})
  await application.evaluate(({BrowserWindow,screen})=>{
    screen.getCursorScreenPoint=()=>{const b=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).getContentBounds();return{x:b.x+b.width/2,y:b.y+b.height-6-(b.height-80)/2}}
    globalThis.deliveryOldNative=globalThis.petTestNativeInput
  })
  const identity=()=>application.evaluate(({BrowserWindow})=>{
    const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet'))
    return{id:w.id,handle:w.getNativeWindowHandle().toString('hex'),bounds:w.getContentBounds(),focused:w.isFocused(),focusable:w.isFocusable()}
  })
  const centre=async()=>{const b=await pet.locator('.pet-character').boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2}}
  // Deliberately inject only this disposable pet's sampled native signal. The
  // actual user's cursor, secure desktop, app and save files are untouched.
  const native=(leftDown,stale=false)=>application.evaluate(({BrowserWindow},{leftDown,stale})=>{
    const b=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).getContentBounds(),scale=1.5
    const input={overWindow:true,leftDown,hitPet:true,captured:false,captureOnPet:false,clickThrough:false,enabled:true,visible:true,
      x:b.width/2*scale,y:(b.height-6-(b.height-80)/2)*scale,width:b.width*scale,height:b.height*scale,dpi:144}
    ;(stale?globalThis.deliveryOldNative:globalThis.petTestNativeInput)(input)
  },{leftDown,stale})
  const initial=await identity();windows.push(initial)
  for(let cycle=0;cycle<3;cycle++){
    await pet.evaluate(theme=>window.desktop.updateSettings({theme}),cycle%2?'dark':'light')
    await native(false);const c=await centre();await pet.mouse.move(c.x,c.y);await pet.mouse.down();await native(true)
    await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','held')
    await new Promise(resolve=>setTimeout(resolve,750));await pet.mouse.up();await native(false)
    await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','idle')
  }
  expect((await identity()).id).toBe(initial.id)
  expect(rows().some(row=>row.event==='input.auto-repair')).toBe(false)
  checks.push('valid presses and sustained holds survive repeated theme changes without automatic replacement')
  await pet.evaluate(()=>window.desktop.updateSettings({inBall:true,theme:'dark'}))
  await expect(pet.locator('.pet-surface')).toHaveAttribute('data-in-ball','true')
  const before=await identity(),saved=await pet.evaluate(()=>window.desktop.getSnapshot())
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).webContents.on('before-mouse-event',(event,input)=>{if(input.type==='mouseDown')event.preventDefault()}))
  await new Promise(resolve=>setTimeout(resolve,600))
  const miss=async()=>{
    await native(false);const c=await centre();await pet.mouse.move(c.x,c.y);await native(true);await pet.mouse.down();await pet.mouse.up();await native(false)
  }
  await miss();await expect.poll(()=>rows().filter(row=>row.event==='input.delivery-missed').length).toBe(1)
  expect((await identity()).id).toBe(before.id);expect(rows().some(row=>row.event==='input.auto-repair')).toBe(false)
  checks.push('one complete native press with its DOM down suppressed is recorded without an immediate rebuild')
  const old=pet;await miss();pet=await currentPet(application,old);watch(pet)
  await expect.poll(()=>rows().filter(row=>row.event==='pet.rebuild-complete').length).toBe(1)
  const after=await identity();windows.push(after)
  expect(after.id).not.toBe(before.id);expect(after.handle).not.toBe(before.handle)
  expect(after.bounds).toEqual(before.bounds);expect(after.focused).toBe(false);expect(after.focusable).toBe(false)
  expect(rows().some(row=>row.event.startsWith('power.'))).toBe(false)
  checks.push('two confirmed lost-down attempts recover automatically without any lock/resume event and create a fresh unfocused native HWND')
  const restored=await pet.evaluate(()=>window.desktop.getSnapshot())
  expect(restored.game).toEqual(saved.game);expect(restored.settings).toEqual(saved.settings);expect(restored.rewards).toEqual(saved.rewards)
  expect(restored.rewards.unlocked.great).toBeTruthy();await expect(pet.locator('.ball-icon')).toHaveAttribute('data-ball','great')
  expect(restored.settings.inBall).toBe(true);expect(after.bounds.width).toBe(88);expect(after.bounds.height).toBe(120)
  expect(await dashboard.evaluate(()=>globalThis.deliveryPanelState)).toBe('keep-dashboard')
  checks.push('growth, rewards, selected ball, theme, pause, compact geometry, position and management renderer survive the recovery')
  for(let n=0;n<3;n++){await native(false,true);await native(true,true);await native(false,true)}
  await new Promise(resolve=>setTimeout(resolve,800));expect(rows().filter(row=>row.event==='input.auto-repair').length).toBe(1)
  checks.push('late native callbacks from the destroyed HWND cannot trigger a second recovery')
  const c=await centre();await pet.mouse.move(c.x,c.y);await pet.mouse.down()
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','held');await pet.mouse.up()
  await expect(pet.locator('.pet-surface')).toHaveAttribute('data-in-ball','false')
  expect((await pet.evaluate(()=>window.desktop.getSnapshot())).game).toEqual(saved.game)
  checks.push('the replacement receives real renderer input: holding works and a short ball click summons the same saved pet')
  await application.close();application=null
  expect(errors).toEqual([]);expect(rows().at(-1).event).toBe('session.end')
  mkdirSync('artifacts',{recursive:true})
  writeFileSync('artifacts/delivery-report.json',JSON.stringify({checks,errors,windows,simulatedNativeSamples:true,actualWindowsLock:false,logPath,executablePath:process.env.POKETOKEN_EXE||electron},null,2))
  writeFileSync('artifacts/delivery-diagnostics.jsonl',readFileSync(logPath))
  console.log(JSON.stringify({checks,errors},null,2))
}finally{if(application)await application.close()}
