import { _electron as electronApp, expect } from '@playwright/test'
import electron from 'electron'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const directory=mkdtempSync(join(tmpdir(),'poketoken-windows-'))
mkdirSync('artifacts',{recursive:true})
const baseEnv={...process.env};delete baseEnv.ELECTRON_RUN_AS_NODE
const scale=process.env.POKETOKEN_TEST_SCALE||'native'
const scaleArgs=scale==='native'?[]:[`--force-device-scale-factor=${scale}`]
const checks=[],errors=[]
let fixture,application
try {
  fixture=await electronApp.launch({executablePath:electron,args:['scripts/window-fixture.cjs',...scaleArgs],env:{...baseEnv,POKETOKEN_FIXTURE_DATA_DIR:join(directory,'fixture')},timeout:60000})
  await fixture.firstWindow()
  // Playwright's Windows launcher can have a different PID from Electron's
  // browser process, which owns the native window.
  const pid=await fixture.evaluate(()=>process.pid)
  application=await electronApp.launch({executablePath:process.env.POKETOKEN_EXE||electron,args:[...(process.env.POKETOKEN_EXE?[]:['.']),'--hidden',...scaleArgs],env:{...baseEnv,POKETOKEN_DATA_DIR:join(directory,'pet'),POKETOKEN_TEST_MODE:'1',POKETOKEN_WINDOW_TEST:'1',POKETOKEN_WINDOW_TEST_PID:String(pid)},timeout:60000})
  await application.firstWindow()
  application.process().stderr?.on('data',data=>{const value=String(data);if(value.includes('Window tracking helper:'))console.log(value)})
  await expect.poll(()=>application.windows().some(w=>w.url().includes('view=pet'))).toBe(true)
  const pet=application.windows().find(w=>w.url().includes('view=pet'))
  pet.on('pageerror',error=>errors.push(error.message))
  await expect.poll(()=>pet.evaluate(async()=>Boolean((await window.desktop.getSnapshot()).lastScan))).toBe(true)
  await pet.evaluate(()=>window.desktop.updateSettings({paused:true,size:128}))
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=dashboard')).close())
  await fixture.evaluate(()=>{globalThis.fixtureWindow.show();globalThis.fixtureWindow.focus()})
  const frames=()=>application.evaluate(()=>globalThis.petTestFrames||[])
  try { await expect.poll(async()=>(await frames()).length,{timeout:30000}).toBe(1) }
  catch(error) {
    console.log(await application.evaluate(({app},pid)=>({fixturePid:pid,ownerPid:process.pid,packaged:app.isPackaged,appPath:app.getAppPath(),nativePids:globalThis.petTestRawPids}),pid))
    throw error
  }
  let frame=(await frames())[0]
  expect(frame.pid).toBe(pid);expect(Object.keys(frame).sort()).toEqual(['height','id','pid','width','x','y'])
  checks.push('real native helper detects only the external fixture geometry without titles or screen capture')
  const bounds=()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).getContentBounds())
  const cursor=point=>application.evaluate(({screen},point)=>{globalThis.petTestCursor=point;screen.getCursorScreenPoint=()=>globalThis.petTestCursor},point)
  const drop=async()=>{
    // Closing/focusing a macOS window may briefly animate its WindowServer
    // bounds. Start a stationary-edge collision check only after native samples
    // agree; a moving edge can legitimately move above a falling pet.
    let key='',stable=0
    await expect.poll(async()=>{
      const owner=(await frames())[0],next=JSON.stringify(owner)
      stable=owner && next===key ? stable+1 : 0;key=next
      return stable
    },{timeout:10000,intervals:[150]}).toBeGreaterThanOrEqual(3)
    const current=await bounds();frame=(await frames())[0]
    await cursor({x:current.x+80,y:current.y+110})
    await pet.mouse.move(80,110);await pet.mouse.down();await pet.mouse.move(88,110)
    await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','held')
    // Feet are 6px above the native window bottom. Release well above the title
    // edge, so the test exercises collision while falling rather than only snapping.
    const left=frame.x+frame.width*.45-88,top=frame.y-current.height+6-50
    await cursor({x:left+80,y:top+110})
    await expect.poll(async()=>(await bounds()).y).toBe(Math.round(top))
    await pet.mouse.up()
    try {await expect(pet.locator('.pet-character')).toHaveAttribute('data-surface',frame.id)}
    catch(error) {
      console.log({expectedOwner:frame,currentFrames:await frames(),petBounds:await bounds(),fixtureBounds:fixture?await fixture.evaluate(()=>globalThis.fixtureWindow.getBounds()):null})
      throw error
    }
    await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','idle')
    // macOS may still animate a restored or newly focused NSWindow. Compare
    // against the current native sample and wait for both windows to settle.
    await expect.poll(async()=>{
      const owner=(await frames()).find(value=>value.id===frame.id),petBounds=await bounds()
      return owner ? Math.abs(petBounds.y+petBounds.height-6-owner.y) : Infinity
    },{timeout:10000}).toBeLessThanOrEqual(1)
    frame=(await frames()).find(value=>value.id===frame.id)
  }
  await drop();checks.push('dragged pet falls onto an external window title edge and stays there while paused')
  const before=await bounds(),oldFrame=frame
  await fixture.evaluate(()=>{const w=globalThis.fixtureWindow,b=w.getBounds();w.setBounds({...b,x:b.x+70,y:b.y-40,width:b.width-100})})
  await expect.poll(async()=>(await frames())[0]?.x).toBeGreaterThan(oldFrame.x+40)
  frame=(await frames())[0]
  await expect.poll(async()=>Math.abs((await bounds()).y+(await bounds()).height-6-frame.y)).toBeLessThanOrEqual(1)
  expect((await bounds()).x).toBeGreaterThan(before.x+40)
  checks.push('pet follows real window movement and resizing without enabling autonomous walking')
  await pet.evaluate(()=>window.desktop.updateSettings({paused:false}))
  const moving=await bounds()
  await expect.poll(async()=>Math.abs((await bounds()).x-moving.x),{timeout:8000}).toBeGreaterThan(12)
  const walked=await bounds();expect(walked.x+24).toBeGreaterThanOrEqual(frame.x-1);expect(walked.x+24+128).toBeLessThanOrEqual(frame.x+frame.width+1)
  await pet.evaluate(()=>window.desktop.updateSettings({paused:true}))
  await pet.screenshot({path:'artifacts/pet-on-window.png',omitBackground:true})
  checks.push('autonomous walking stays supported by the window edge')
  const supported=await bounds(),supportId=frame.id
  await fixture.evaluate(({BrowserWindow},{x,y})=>{
    const cover=new BrowserWindow({x:Math.round(x),y:Math.round(y),width:300,height:300,title:'PokeToken cover test',backgroundColor:'#dfe8d7',webPreferences:{sandbox:true}})
    globalThis.fixtureCover=cover
    void cover.loadURL('data:text/html,<body style="background:%23dfe8d7">Cover test</body>')
    cover.show();cover.focus()
  },{x:supported.x+20,y:frame.y-100})
  await expect.poll(async()=>(await frames()).length).toBe(2)
  await expect(pet.locator('.pet-character')).not.toHaveAttribute('data-surface',supportId)
  checks.push('a real foreground window covering the supporting edge detaches the pet')
  await fixture.evaluate(()=>globalThis.fixtureCover.close())
  await expect.poll(async()=>(await frames()).length).toBe(1)
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','idle')
  await fixture.evaluate(()=>globalThis.fixtureWindow.focus())
  await drop()
  await fixture.evaluate(()=>globalThis.fixtureWindow.minimize())
  await expect.poll(async()=>(await frames()).length,{timeout:10000}).toBe(0)
  await expect(pet.locator('.pet-character')).not.toHaveAttribute('data-surface',oldFrame.id)
  const area=await application.evaluate(({screen})=>screen.getPrimaryDisplay().workArea)
  await expect.poll(async()=>{const b=await bounds();return b.y+b.height},{timeout:10000}).toBe(area.y+area.height)
  checks.push('minimizing the owner removes support and drops the pet to the desktop floor')
  await fixture.evaluate(()=>{globalThis.fixtureWindow.restore();globalThis.fixtureWindow.show();globalThis.fixtureWindow.focus()})
  await expect.poll(async()=>(await frames()).length,{timeout:10000}).toBe(1)
  await drop()
  await fixture.evaluate(({BrowserWindow,screen})=>{
    globalThis.fixtureWindow.hide()
    const area=screen.getPrimaryDisplay().workArea
    const custom=new BrowserWindow({frame:false,resizable:true,width:500,height:240,x:area.x+200,y:Math.round(area.y+area.height*.55),show:false,backgroundColor:'#eff5e8',webPreferences:{sandbox:true}})
    globalThis.fixtureCustom=custom
    void custom.loadURL('data:text/html,<body style="background:%23eff5e8">Custom title bar test</body>').then(()=>{custom.show();custom.focus()})
  })
  await expect.poll(async()=>(await frames()).length,{timeout:10000}).toBe(1)
  await expect.poll(async()=>(await frames())[0]?.id,{timeout:10000}).not.toBe(frame.id)
  await drop()
  checks.push('a resizable custom-title-bar window supports the pet without WS_CAPTION')
  await fixture.close();fixture=null
  await expect.poll(async()=>(await frames()).length,{timeout:10000}).toBe(0)
  await expect.poll(async()=>{const b=await bounds();return b.y+b.height},{timeout:10000}).toBe(area.y+area.height)
  checks.push('closing the real owner window drops the pet without stale attachment')
  // A window belonging to the pet app must be supported too. The native pet
  // window must remain excluded, or it would land on its own rectangle.
  const appPid=await application.evaluate(()=>process.pid)
  await application.evaluate(({BrowserWindow,screen})=>{
    const dashboard=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=dashboard'))
    const area=screen.getPrimaryDisplay().workArea
    dashboard.setBounds({x:area.x+100,y:Math.round(area.y+area.height*.35),width:900,height:680})
    dashboard.show();dashboard.focus()
  })
  await expect.poll(async()=>(await frames()).length,{timeout:10000}).toBe(1)
  expect((await frames())[0].pid).toBe(appPid)
  await drop()
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=dashboard')).hide())
  await expect.poll(async()=>(await frames()).length).toBe(0)
  await expect.poll(async()=>{const b=await bounds();return b.y+b.height},{timeout:10000}).toBe(area.y+area.height)
  checks.push('the app management window supports the pet while its floating character window remains excluded')
  expect(errors).toEqual([])
  writeFileSync(`artifacts/window-motion-report${scale==='native'?'':`-${scale}`}.json`,JSON.stringify({scale,checks,errors,fixtureFrame:frame,executablePath:process.env.POKETOKEN_EXE||electron},null,2))
  console.log(JSON.stringify({checks,errors},null,2))
} finally {
  if(application)await application.close()
  if(fixture)await fixture.close()
}
