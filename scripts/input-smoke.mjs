import { _electron as electronApp, expect } from '@playwright/test'
import electron from 'electron'
import { currentPet } from './current-pet.mjs'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const directory=mkdtempSync(join(tmpdir(),'poketoken-input-')),checks=[],errors=[]
const env={...process.env,POKETOKEN_DATA_DIR:directory,POKETOKEN_TEST_MODE:'1'};delete env.ELECTRON_RUN_AS_NODE
let application
const logPath=join(directory,'diagnostics/pet-input.jsonl')
const rows=()=>{try{return readFileSync(logPath,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))}catch{return[]}}
try {
  application=await electronApp.launch({executablePath:process.env.POKETOKEN_EXE||electron,args:[...(process.env.POKETOKEN_EXE?[]:['.']),'--hidden'],env,timeout:60000})
  await application.firstWindow()
  await expect.poll(()=>application.windows().some(w=>w.url().includes('view=pet'))).toBe(true)
  let pet=application.windows().find(w=>w.url().includes('view=pet'))
  const dashboard=application.windows().find(w=>w.url().includes('view=dashboard'))
  pet.on('pageerror',error=>errors.push(error.message))
  await expect.poll(()=>pet.evaluate(async()=>Boolean((await window.desktop.getSnapshot()).lastScan))).toBe(true)
  await pet.evaluate(()=>window.desktop.updateSettings({paused:true,size:128}))
  await application.evaluate(({BrowserWindow,screen})=>{
    const bounds=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).getContentBounds()
    screen.getCursorScreenPoint=()=>({x:bounds.x+80,y:bounds.y+110})
  })
  await pet.mouse.move(80,110);await pet.mouse.down()
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','held')
  // A different pointer's capture loss must not cancel this active press.
  await pet.evaluate(()=>window.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:777,buttons:0})))
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','held')
  await pet.mouse.up();await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','idle')
  checks.push('a foreign pointer capture loss does not cancel the active grab')
  await expect.poll(()=>rows().some(row=>row.event==='ipc.drag'&&row.data.action==='release'&&row.data.result==='pet')).toBe(true)
  for(const event of ['session.start','renderer.ready','electron.mouse','renderer.pointerdown','renderer.handler.down','renderer.pointerup','renderer.handler.up','controller.motion','ipc.drag'])expect(rows().some(row=>row.event===event)).toBe(true)
  checks.push('normal click logs Electron input, DOM dispatch, handler, IPC, held state and petting result in one ordered session')
  // Exercise the exact exception path that previously aborted all start IPC.
  await pet.evaluate(()=>{
    globalThis.originalCapture=Element.prototype.setPointerCapture
    Element.prototype.setPointerCapture=function(pointerId){if(this.matches('.pet-character'))throw new DOMException('injected capture failure','NotFoundError');return globalThis.originalCapture.call(this,pointerId)}
  })
  await pet.mouse.down();await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','held')
  await pet.mouse.up();await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','idle')
  await expect.poll(()=>rows().some(row=>row.event==='renderer.capture.failed'&&row.data.error==='NotFoundError')).toBe(true)
  checks.push('NotFoundError from setPointerCapture is recorded and still permits a grab and petting release without a renderer error')
  await pet.mouse.down();await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','held')
  await pet.evaluate(()=>window.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,pointerType:'mouse',buttons:0})))
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','idle')
  await pet.mouse.up()
  checks.push('a missed mouse release is completed when a later pointer move reports the left button is up')
  await pet.evaluate(()=>{Element.prototype.setPointerCapture=globalThis.originalCapture})
  await application.evaluate(({powerMonitor})=>{powerMonitor.emit('lock-screen');powerMonitor.emit('unlock-screen')})
  pet=await currentPet(application,pet);pet.on('pageerror',error=>errors.push(error.message))
  await expect.poll(()=>rows().some(row=>row.event==='renderer.reset')).toBe(true)
  await expect.poll(()=>rows().some(row=>row.event==='power.unlock')).toBe(true)
  await expect.poll(()=>rows().some(row=>row.event==='renderer.heartbeat'&&(process.platform!=='win32'||row.data.state.generation===2)),{timeout:10000}).toBe(true)
  checks.push('renderer/main heartbeats and lock/unlock reset are persisted')
  const privateText='this-must-never-reach-the-input-log'
  await dashboard.evaluate(value=>window.desktop.tracePetInput({event:'handler.down',x:123456,prompt:value}),privateText)
  await pet.evaluate(value=>window.desktop.tracePetInput({event:'heartbeat',x:42,prompt:value,path:value,token:value}),privateText)
  await expect.poll(()=>rows().some(row=>row.event==='renderer.heartbeat'&&row.data.x===42)).toBe(true)
  expect(rows().some(row=>row.data.x===123456)).toBe(false)
  expect(readFileSync(logPath,'utf8')).not.toContain(privateText)
  checks.push('only the pet renderer can write validated diagnostic fields; arbitrary text and dashboard traces are discarded')
  expect(errors).toEqual([])
  await application.close();application=null
  expect(rows().at(-1).event).toBe('session.end')
  expect(rows().every((row,index,list)=>!index||row.seq>list[index-1].seq)).toBe(true)
  checks.push('normal quit flushes the final session record without losing event ordering')
  mkdirSync('artifacts',{recursive:true})
  writeFileSync('artifacts/input-report.json',JSON.stringify({checks,errors,logPath,events:rows().length,executablePath:process.env.POKETOKEN_EXE||electron},null,2))
  console.log(JSON.stringify({checks,errors,events:rows().length},null,2))
}finally{if(application)await application.close()}
