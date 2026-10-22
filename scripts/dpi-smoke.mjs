import { _electron as electronApp, expect } from './test-electron.mjs'
import electron from 'electron'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const scales = process.platform === 'win32' ? ['native','1.25','1.5'] : ['native']
const baseEnv = { ...process.env, POKETOKEN_TEST_MODE: '1' }; delete baseEnv.ELECTRON_RUN_AS_NODE
const cases = [], runs = [], errors = []
mkdirSync('artifacts', { recursive: true })
for (const scale of scales) {
  let application
  try {
    application = await electronApp.launch({
      executablePath: process.env.POKETOKEN_EXE || electron,
      args: [...(process.env.POKETOKEN_EXE ? [] : ['.']), '--hidden', ...(scale === 'native' ? [] : [`--force-device-scale-factor=${scale}`])],
      env: { ...baseEnv, POKETOKEN_DATA_DIR: mkdtempSync(join(tmpdir(),'poketoken-dpi-')) }, timeout: 60000
    })
    await application.firstWindow()
    await expect.poll(()=>application.windows().some(w=>w.url().includes('view=pet'))).toBe(true)
    const pet = application.windows().find(w=>w.url().includes('view=pet'))
    pet.on('pageerror',error=>errors.push(error.message))
    await expect.poll(()=>pet.evaluate(async()=>Boolean((await window.desktop.getSnapshot()).lastScan))).toBe(true)
    await application.evaluate(({ipcMain})=>{
      globalThis.dpiInteractions={}
      ipcMain.on('pet:drag',(_event,action)=>{globalThis.dpiInteractions[action]=(globalThis.dpiInteractions[action]||0)+1})
    })
    const displays = await application.evaluate(({screen})=>screen.getAllDisplays().map(d=>({id:d.id,workArea:d.workArea,scaleFactor:d.scaleFactor})))
    const bounds = ()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).getContentBounds())
    const cursor = point=>application.evaluate(({screen},point)=>{globalThis.dpiCursor=point;screen.getCursorScreenPoint=()=>globalThis.dpiCursor},point)
    // Dashboard zoom must not enlarge the speech or shrink the pet viewport.
    await application.evaluate(({BrowserWindow})=>{
      const dashboard=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=dashboard'))
      dashboard.webContents.setZoomFactor(1.5);dashboard.hide()
    })
    await expect.poll(()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).webContents.getZoomFactor())).toBe(1)
    for (const size of [96,128,192]) {
      await pet.evaluate(size=>window.desktop.updateSettings({size,paused:true}),size)
      // Cycle through actual connected monitors in both directions, including a
      // return to the primary. Only this disposable app's cursor is substituted.
      for (const display of [...displays,...displays.slice().reverse()]) {
        const area=display.workArea, samples=[]
        for(let repeat=0;repeat<12;repeat++) {
          const before=await bounds()
          const local={x:24+size/2,y:before.height-6-size/2}
          await cursor({x:before.x+local.x,y:before.y+local.y})
          await pet.mouse.move(local.x,local.y);await pet.mouse.down()
          await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','held')
          const target={x:area.x+area.width*.55+repeat,y:area.y+area.height-4}
          await cursor(target)
          await pet.mouse.move(local.x+8,local.y)
          await expect.poll(async()=>Math.abs((await bounds()).x-target.x+local.x)).toBeLessThanOrEqual(1)
          await pet.mouse.up()
          await expect(pet.locator('.pet-character')).not.toHaveAttribute('data-motion','held')
          await expect.poll(async()=>{
            const b=await bounds();return Math.abs(b.y+b.height-area.y-area.height)
          }).toBeLessThanOrEqual(1)
          const b=await bounds();samples.push(b)
          expect(Math.abs(b.width-size-48)).toBeLessThanOrEqual(1)
          expect(Math.abs(b.height-size-80)).toBeLessThanOrEqual(1)
          expect(b.x).toBeGreaterThanOrEqual(area.x-1)
          expect(b.x+b.width).toBeLessThanOrEqual(area.x+area.width+1)
          try {await expect.poll(()=>pet.evaluate(async()=>String((await window.desktop.getSnapshot()).settings.displayId))).toBe(String(display.id))}
          catch(error) {console.log({scale,size,display,repeat,bounds:await bounds(),snapshot:await pet.evaluate(async()=>{const s=await window.desktop.getSnapshot();return{displayId:s.settings.displayId,scanning:s.scanning}})});throw error}
        }
        const layout=await pet.evaluate(()=>{
          const c=document.querySelector('.pet-character').getBoundingClientRect(),bubble=document.querySelector('.pet-bubble')
          return {width:innerWidth,height:innerHeight,characterWidth:c.width,characterHeight:c.height,bottomGap:innerHeight-c.bottom,bubbleWidth:bubble?.getBoundingClientRect().width ?? null,fontSize:bubble ? getComputedStyle(bubble).fontSize : null,dpr:devicePixelRatio}
        })
        expect(layout.characterWidth).toBe(size);expect(layout.characterHeight).toBe(size)
        expect(layout.bottomGap).toBe(6)
        // Compact speech and speech with a growth summary use 9 DIP; other
        // speech uses 10 DIP. Neither may inherit dashboard zoom or OS scaling.
        if(layout.bubbleWidth!==null){expect(layout.bubbleWidth).toBeLessThanOrEqual(size+48);expect(['9px','10px']).toContain(layout.fontSize)}
        cases.push({scale,size,display,layout,samples})
      }
      console.log(`DPI ${scale}, size ${size}: ${displays.length} monitor(s), repeated moves and viewport checks passed.`)
    }
    // Check the click reaction and speech at this density with real DOM input.
    const b=await bounds(),size=192
    await cursor({x:b.x+24+size/2,y:b.y+b.height-6-size/2})
    await pet.mouse.move(24+size/2,b.height-6-size/2);await pet.mouse.down();await pet.mouse.up()
    await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-dialogue','petting')
    await expect(pet.locator('.pet-affection')).toBeVisible()
    expect(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=dashboard')).isVisible())).toBe(false)
    await pet.screenshot({path:`artifacts/pet-dpi-${scale.replace('.','-')}.png`,omitBackground:true})
    const box=await pet.locator('.pet-bubble').boundingBox()
    expect(box.width).toBeLessThanOrEqual(size+48)
    expect(['9px','10px']).toContain(await pet.locator('.pet-bubble').evaluate(e=>getComputedStyle(e).fontSize))
    runs.push({scale,interactions:await application.evaluate(()=>globalThis.dpiInteractions)})
  } finally {if(application)await application.close()}
}
expect(errors).toEqual([])
writeFileSync('artifacts/dpi-report.json',JSON.stringify({cases,runs,errors},null,2))
console.log(`${cases.length} DPI/size/monitor cases passed; errors: ${errors.length}.`)
