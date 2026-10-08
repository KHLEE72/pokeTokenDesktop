import { _electron as electronApp, expect } from '@playwright/test'
import electron from 'electron'
import { mkdirSync, mkdtempSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const live = process.argv.includes('--live')
const directory = mkdtempSync(join(tmpdir(), 'poketoken-smoke-'))
const logs = join(directory, 'logs'); mkdirSync(logs)
mkdirSync('artifacts', { recursive: true })
const env = { ...process.env, POKETOKEN_DATA_DIR: join(directory, 'data'), POKETOKEN_TEST_MODE: live ? '0' : '1' }
delete env.ELECTRON_RUN_AS_NODE
const executablePath = process.env.POKETOKEN_EXE || electron
const args = process.env.POKETOKEN_EXE ? [] : ['.']
const errors = [], checks = []
const row = (id,input,timestamp=new Date().toISOString()) => JSON.stringify({type:'assistant',timestamp,requestId:'smoke',message:{id,usage:{input_tokens:input,output_tokens:0}}})+'\n'
let application
async function start() {
  const app = await electronApp.launch({executablePath,args,cwd:process.cwd(),env,timeout:60_000})
  await app.firstWindow()
  await expect.poll(()=>app.windows().some(window=>window.url().includes('view=dashboard')),{timeout:60_000}).toBe(true)
  const page = app.windows().find(window=>window.url().includes('view=dashboard'))
  page.on('pageerror',error=>errors.push(error.message))
  await expect(page.getByRole('heading',{name:'오늘도, 함께 성장해요'})).toBeVisible({timeout:60_000})
  await expect.poll(async()=>page.evaluate(async()=>{ const s = await window.desktop.getSnapshot(); return !s.scanning && s.lastScan !== null }),{timeout:120_000}).toBe(true)
  return {app,page}
}
try {
  const launched = await start(); application=launched.app; const page=launched.page
  if (live) {
    const snapshot=await page.evaluate(()=>window.desktop.getSnapshot())
    expect(snapshot.roots.some(root=>root.state==='connected')).toBe(true)
    checks.push('live local logs read without model calls')
    await page.screenshot({path:'artifacts/live-home.png'})
    writeFileSync('artifacts/live-report.json',JSON.stringify({checks,usage:snapshot.usage,rootStates:snapshot.roots.map(r=>({provider:r.provider,state:r.state,files:r.files})),tokensEarned:snapshot.game.tokensEarned,errors},null,2))
  } else {
    const file=join(logs,'claude.jsonl'); writeFileSync(file,row('old',25_000_000,'2000-01-01T00:00:00Z'))
    await page.evaluate(path=>window.desktop.updateSettings({roots:{claude:[path],codex:[]}}),logs)
    const initial=await page.evaluate(()=>window.desktop.getSnapshot())
    expect(initial.game.tokensEarned).toBe(0); expect(initial.usage.claude.all).toBe(25_000_000)
    checks.push('first connection baselines historical records')
    await page.screenshot({path:'artifacts/home.png'})
    appendFileSync(file,row('new',500_050,new Date(Date.now()+1000).toISOString()))
    await page.evaluate(()=>window.desktop.refresh())
    const grown=await page.evaluate(()=>window.desktop.getSnapshot())
    const petState=grown.game.pets.find(p=>p.id===grown.game.activeId)
    expect(grown.game.tokensEarned).toBe(500_050); expect(petState.phase).toBe(1); expect(petState.xp).toBe(50)
    checks.push('real IPC scanner hatches on new usage')
    await expect(page.locator('.habitat-sprite img')).toBeVisible({timeout:30_000})
    await page.screenshot({path:'artifacts/home-grown.png'})
    await page.getByRole('button',{name:'나의 도감',exact:false}).first().click()
    await expect(page.getByRole('heading',{name:'나의 작은 도감'})).toBeVisible()
    expect(await page.locator('.dex-card').count()).toBe(9)
    await page.screenshot({path:'artifacts/dex.png'})
    checks.push('nine species per collection page render')
    await page.getByRole('button',{name:'설정',exact:false}).first().click()
    await page.getByRole('button',{name:'192px',exact:true}).click()
    await expect.poll(()=>page.evaluate(async()=>(await window.desktop.getSnapshot()).settings.size)).toBe(192)
    await page.getByRole('button',{name:'기본',exact:true}).click()
    await expect.poll(()=>page.evaluate(async()=>{const s=await window.desktop.getSnapshot();return s.game.pets.find(p=>p.id===s.game.activeId).xp})).toBe(500)
    await page.screenshot({path:'artifacts/settings.png'})
    checks.push('settings UI persists size and preserves growth percentage')
    const windows=await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({url:w.webContents.getURL(),visible:w.isVisible(),focusable:w.isFocusable(),top:w.isAlwaysOnTop(),bounds:w.getBounds()})))
    const pet=windows.find(w=>w.url.includes('view=pet'))
    expect(pet?.visible).toBe(true);expect(pet?.focusable).toBe(false);expect(pet?.top).toBe(true);expect(pet?.bounds.width).toBe(240)
    checks.push('separate pet window is visible, topmost and non-focusable')
    const petPage=application.windows().find(page=>page.url().includes('view=pet'))
    expect(await petPage.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    checks.push('pet root background is transparent')
    await page.evaluate(()=>window.desktop.updateSettings({visible:false}))
    expect(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).isVisible())).toBe(false)
    await page.evaluate(()=>window.desktop.updateSettings({visible:true,paused:true}))
    checks.push('hide/show and pause work through persisted IPC')
    await application.close();application=null
    appendFileSync(file,row('offline',100,new Date(Date.now()+1500).toISOString()))
    const reopened=await start();application=reopened.app
    const resumed=await reopened.page.evaluate(()=>window.desktop.getSnapshot())
    expect(resumed.game.tokensEarned).toBe(500_150);expect(resumed.settings.size).toBe(192)
    await reopened.page.evaluate(()=>window.desktop.refresh())
    expect((await reopened.page.evaluate(()=>window.desktop.getSnapshot())).game.tokensEarned).toBe(500_150)
    checks.push('restart restores growth and offline usage exactly once')
    // Closing the management window keeps the tray companion alive.
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=dashboard')).close())
    expect(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().includes('view=dashboard')&&!w.isVisible()))).toBe(true)
    checks.push('closing dashboard keeps companion running')
    expect(errors).toEqual([])
    writeFileSync('artifacts/smoke-report.json',JSON.stringify({executablePath,checks,errors,temporaryData:directory},null,2))
  }
  console.log(JSON.stringify({checks,errors},null,2))
} finally { if(application)await application.close() }
