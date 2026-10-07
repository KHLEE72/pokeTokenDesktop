import { _electron as electronApp, expect } from '@playwright/test'
import electron from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const execute=promisify(execFile), directory=mkdtempSync(join(tmpdir(),'poketoken-health-'))
const env={...process.env,POKETOKEN_DATA_DIR:directory,POKETOKEN_TEST_MODE:'1'};delete env.ELECTRON_RUN_AS_NODE
const checks=[],errors=[],samples=[]
let application,fixture
mkdirSync('artifacts',{recursive:true})
try {
  application=await electronApp.launch({executablePath:process.env.POKETOKEN_EXE||electron,args:[...(process.env.POKETOKEN_EXE?[]:['.']),'--hidden'],env,timeout:60000})
  await application.firstWindow()
  await expect.poll(()=>application.windows().some(w=>w.url().includes('view=pet'))).toBe(true)
  const pet=application.windows().find(w=>w.url().includes('view=pet'))
  pet.on('pageerror',error=>errors.push(error.message))
  await expect.poll(()=>pet.evaluate(async()=>Boolean((await window.desktop.getSnapshot()).lastScan))).toBe(true)
  await pet.evaluate(()=>window.desktop.updateSettings({paused:true,size:128}))
  const bounds=()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).getContentBounds())
  const cursor=point=>application.evaluate(({screen},point)=>{globalThis.healthCursor=point;screen.getCursorScreenPoint=()=>globalThis.healthCursor},point)
  const current=await bounds()
  await cursor({x:current.x+80,y:current.y+110})
  await application.evaluate(({BrowserWindow})=>{
    const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet'))
    const ignore=w.setIgnoreMouseEvents.bind(w),top=w.moveTop.bind(w)
    globalThis.healthOriginalIgnore=ignore;globalThis.healthTopCalls=0
    w.setIgnoreMouseEvents=(value,options)=>{globalThis.healthIgnored=value;ignore(value,options)}
    w.moveTop=()=>{globalThis.healthTopCalls++;top()}
  })
  await expect.poll(()=>application.evaluate(()=>globalThis.healthIgnored)).toBe(false)
  for(let cycle=0;cycle<12;cycle++) {
    // Only native input changes. The controller still remembers the previous
    // value; do not move/enter the renderer pointer to make recovery easier.
    const after=Date.now()
    await application.evaluate(()=>{globalThis.healthOriginalIgnore(true,{forward:true});globalThis.healthIgnored=undefined})
    // Wait for a newly delivered native call rather than the cached observation.
    await application.evaluate(()=>{globalThis.healthIgnored=undefined})
    await expect.poll(()=>application.evaluate(()=>globalThis.healthIgnored),{intervals:[100]}).toBe(false)
    await pet.mouse.move(80,110);await pet.mouse.down()
    await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','held')
    if(cycle===0) {
      const calls=await application.evaluate(()=>globalThis.healthTopCalls)
      await expect.poll(()=>application.evaluate(()=>globalThis.healthTopCalls),{intervals:[150]}).toBeGreaterThan(calls+1)
      expect(await pet.locator('.pet-character').evaluate(e=>e.hasPointerCapture(1))).toBe(true)
    }
    await pet.mouse.up()
    await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','idle')
    await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-dialogue','petting')
    samples.push({cycle,recoveredAndClickedMs:Date.now()-after})
  }
  checks.push('twelve native click-through faults recover without pointer entry or session events, and each permits a fresh grab and petting click')
  checks.push('periodic input/order refresh preserves a sustained renderer pointer capture')
  const original=await bounds()
  fixture=await electronApp.launch({executablePath:electron,args:['scripts/window-fixture.cjs'],env:{...env,POKETOKEN_FIXTURE_DATA_DIR:join(directory,'cover')},timeout:60000})
  await fixture.firstWindow()
  await fixture.evaluate((_,rect)=>{
    const w=globalThis.fixtureWindow
    w.setBounds({...rect,x:rect.x-10,y:rect.y-10,width:rect.width+30,height:rect.height+30})
    w.setAlwaysOnTop(true,'pop-up-menu');w.show();w.focus()
  },original)
  const petId=await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).getMediaSourceId().split(':')[1])
  const coverId=await fixture.evaluate(()=>globalThis.fixtureWindow.getMediaSourceId().split(':')[1])
  const before=await application.evaluate(()=>globalThis.healthTopCalls)
  await expect.poll(()=>application.evaluate(()=>globalThis.healthTopCalls)).toBeGreaterThan(before)
  const args=process.platform==='win32'
    ? ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','scripts/window-health-probe.ps1','-PetHandle',petId,'-CoverHandle',coverId]
    : ['swift','scripts/window-health-probe.swift',petId,coverId]
  const executable=process.platform==='win32' ? join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe') : 'xcrun'
  const {stdout}=await execute(executable,args,{windowsHide:true,timeout:30000})
  const native=JSON.parse(stdout.trim())
  expect(native.petAboveCover).toBe(true);expect(native.topmost).toBe(true);expect(native.visible).toBe(true)
  if(process.platform==='win32'){expect(native.clickThrough).toBe(false);expect(native.focused).toBe(false)}
  expect(await bounds()).toEqual(original)
  expect(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).isFocused())).toBe(false)
  checks.push('real OS window order puts the pet above a newer always-on-top application window without moving or focusing it')
  await cursor({x:original.x+5,y:original.y+20})
  await application.evaluate(()=>{globalThis.healthOriginalIgnore(false);globalThis.healthIgnored=undefined})
  await expect.poll(()=>application.evaluate(()=>globalThis.healthIgnored)).toBe(true)
  checks.push('transparent speech/margins recover click-through after native state drift')
  await pet.evaluate(()=>window.desktop.updateSettings({visible:false}))
  const hiddenCalls=await application.evaluate(()=>globalThis.healthTopCalls)
  await application.evaluate(({powerMonitor})=>powerMonitor.emit('lock-screen'))
  await new Promise(resolve=>setTimeout(resolve,1200))
  expect(await application.evaluate(()=>globalThis.healthTopCalls)).toBe(hiddenCalls)
  expect(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).isVisible())).toBe(false)
  checks.push('hidden/locked pets remain hidden during order recovery')
  expect(errors).toEqual([])
  writeFileSync('artifacts/health-report.json',JSON.stringify({checks,errors,samples,native,executablePath:process.env.POKETOKEN_EXE||electron},null,2))
  console.log(JSON.stringify({checks,errors,native},null,2))
} finally {
  if(fixture)await fixture.close()
  if(application)await application.close()
}
