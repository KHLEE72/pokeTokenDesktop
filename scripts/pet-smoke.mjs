import { _electron as electronApp, expect } from '@playwright/test'
import electron from 'electron'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const directory = mkdtempSync(join(tmpdir(), 'poketoken-pet-'))
const env = { ...process.env, POKETOKEN_DATA_DIR: directory, POKETOKEN_TEST_MODE: '1' }
delete env.ELECTRON_RUN_AS_NODE
mkdirSync('artifacts', { recursive: true })
const checks = [], errors = []
let application
try {
  application = await electronApp.launch({ executablePath: process.env.POKETOKEN_EXE || electron, args: process.env.POKETOKEN_EXE ? [] : ['.'], cwd: process.cwd(), env, timeout: 60_000 })
  await application.firstWindow()
  await expect.poll(() => application.windows().some(w => w.url().includes('view=pet'))).toBe(true)
  const pet = application.windows().find(w => w.url().includes('view=pet'))
  pet.on('pageerror', e => errors.push(e.message))
  await expect.poll(() => pet.evaluate(async () => Boolean((await window.desktop.getSnapshot()).lastScan))).toBe(true)
  await pet.evaluate(() => window.desktop.updateSettings({ paused: true, size: 128 }))
  const logs = join(directory, 'logs');mkdirSync(logs)
  const file = join(logs, 'usage.jsonl');writeFileSync(file, '')
  await pet.evaluate(path => window.desktop.updateSettings({ roots: { claude: [path], codex: [] } }), logs)
  writeFileSync(file, JSON.stringify({type:'assistant',timestamp:new Date(Date.now()+1000).toISOString(),requestId:'pet-smoke',message:{id:'hatch',usage:{input_tokens:500_000}}})+'\n')
  await pet.evaluate(() => window.desktop.refresh())
  const snapshot = await pet.evaluate(() => window.desktop.getSnapshot())
  expect(snapshot.game.pets.find(p=>p.id===snapshot.game.activeId).phase).toBe(1)
  const sendSpecies = async id => {
    const phase=(id-1)%3+1
    // Each visual sample represents growth from an egg, not a manual switch
    // between completed families (which deliberately uses greeting dialogue).
    const egg={...snapshot,game:{...snapshot.game,pets:[{...snapshot.game.pets.find(p=>p.id===snapshot.game.activeId),family:null,phase:0,xp:0,shiny:false}],displayPhase:0}}
    await application.evaluate(({BrowserWindow},value)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).webContents.send('snapshot',value),egg)
    await expect(pet.locator('.pet-character .egg')).toBeVisible()
    const value = { ...snapshot, game: { ...snapshot.game, pets:[{...snapshot.game.pets.find(p=>p.id===snapshot.game.activeId),family:Math.floor((id-1)/3),phase,shiny:false}],displayPhase:phase,owned:[id],tokensEarned:snapshot.game.tokensEarned+id }, notice:'진화 1회' }
    await application.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet')).webContents.send('snapshot', value), value)
  }
  const names = ['이상해씨','이상해풀','이상해꽃','파이리','리자드','리자몽','꼬부기','어니부기','거북왕']
  for (let id = 1; id <= 9; id++) {
    await sendSpecies(id)
    await expect(pet.locator('.pet-character img')).toHaveAttribute('alt', names[id - 1], { timeout: 30_000 })
    await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-dialogue', 'growth')
    expect(await pet.locator('.pet-bubble > span').textContent()).not.toMatch(/오늘 .*토큰/)
  }
  checks.push('all nine evolutions render their character dialogue')
  // Restore the real hatched pet before testing settings snapshots during a fall.
  await pet.evaluate(() => window.desktop.refresh())
  const realName = names[snapshot.game.pets.find(p=>p.id===snapshot.game.activeId).family * 3]
  await expect(pet.locator('.pet-character img')).toHaveAttribute('alt', realName)
  const getBounds = () => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet')).getBounds())
  const bounds = await getBounds()
  const area = await application.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
  const origin = { x: bounds.x + 80, y: bounds.y + 110 }
  // Override cursor readings only inside this disposable test app. The user's
  // actual pointer is never moved and personal app data is never loaded.
  await application.evaluate(({ screen }, point) => { globalThis.petTestCursor = point; screen.getCursorScreenPoint = () => globalThis.petTestCursor }, origin)
  // Exercise renderer pointer capture and the native four-DIP drag threshold.
  await pet.mouse.move(80, 110); await pet.mouse.down()
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion', 'held')
  await pet.mouse.move(88, 110)
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion', 'held')
  const releaseY = area.y + Math.max(20, (area.height - bounds.height) * .18)
  await application.evaluate((_, point) => { globalThis.petTestCursor = point }, { x: origin.x + 100, y: releaseY + 110 })
  await expect.poll(async () => (await getBounds()).y).toBe(Math.round(releaseY))
  await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-dialogue', 'held')
  await pet.screenshot({ path: 'artifacts/pet-held.png', omitBackground: true })
  expect(await pet.locator('.state-held > .sprite').evaluate(e => getComputedStyle(e).animationName)).toBe('pet-dangle')
  checks.push('real pointer capture triggers hanging, sway and species-specific grab dialogue')
  // Collect native window positions and delivered states while releasing. This
  // catches a floor teleport even if the CSS falling animation still plays.
  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet'))
    globalThis.petTestSamples = []; globalThis.petTestSampler = setInterval(() => globalThis.petTestSamples.push({ time: Date.now(), y: window.getBounds().y }), 16)
  })
  await pet.mouse.up()
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion', 'falling')
  await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-dialogue', 'falling')
  const falling = await getBounds()
  expect(falling.y).toBeLessThan(area.y + area.height - bounds.height)
  await pet.screenshot({ path: 'artifacts/pet-falling.png', omitBackground: true })
  // A refresh publishes settings twice; both snapshots must preserve the fall.
  await pet.evaluate(() => window.desktop.refresh())
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion', 'landing')
  await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-dialogue', 'landing')
  await expect(pet.locator('.pet-character img')).toHaveAttribute('alt', realName)
  expect(await pet.locator('.state-landing > .sprite').evaluate(e => getComputedStyle(e).animationName)).toBe('pet-land')
  expect(await pet.locator('.pet-dust i').count()).toBe(4)
  await pet.screenshot({ path: 'artifacts/pet-landing.png', omitBackground: true })
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion', 'idle')
  const samples = await application.evaluate(() => { clearInterval(globalThis.petTestSampler); return globalThis.petTestSamples })
  const floor = area.y + area.height - bounds.height
  expect(samples.filter(s => s.y > releaseY + 10 && s.y < floor - 10).length).toBeGreaterThan(5)
  expect(Math.max(...samples.map(s => s.y))).toBe(floor)
  for (let i = 1; i < samples.length; i++) expect(samples[i].y).toBeGreaterThanOrEqual(samples[i - 1].y)
  const final = await getBounds();expect(final.y + final.height).toBe(area.y + area.height)
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet')).isFocusable())).toBe(false)
  checks.push('native window falls through intermediate positions, survives a refresh, lands and rests while walking is paused')
  checks.push('landing squash, bounce, dust and landing dialogue render without focus theft')
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=dashboard')).close())
  await pet.mouse.move(80, 110);await pet.mouse.down()
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion', 'held')
  await pet.mouse.up()
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion', 'idle')
  await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-dialogue', 'petting')
  await expect(pet.locator('.pet-affection')).toBeVisible()
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=dashboard')).isVisible())).toBe(false)
  await pet.screenshot({path:'artifacts/pet-petted.png',omitBackground:true})
  checks.push('a click shows petting animation and character dialogue without opening or focusing the dashboard')
  // Emit session events inside the disposable app instead of locking the user's
  // real computer. Observe actual native API calls without changing their behavior.
  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet'))
    const setIgnore = window.setIgnoreMouseEvents.bind(window)
    window.setIgnoreMouseEvents = (ignore, options) => { globalThis.petTestIgnored = ignore; setIgnore(ignore, options) }
  })
  const power = event => application.evaluate(({ powerMonitor }, event) => { powerMonitor.emit(event) }, event)
  const visible = () => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet')).isVisible())
  const ignored = () => application.evaluate(() => globalThis.petTestIgnored)
  const placeCursor = point => application.evaluate((_, point) => { globalThis.petTestCursor = point }, point)
  let current = await getBounds()
  await placeCursor({ x: current.x + 80, y: current.y + 110 })
  await power('lock-screen');expect(await visible()).toBe(false)
  await power('unlock-screen');expect(await visible()).toBe(true)
  // No renderer mouse movement/enter is sent between locking and this assertion.
  await expect.poll(ignored).toBe(false)
  await placeCursor({ x: current.x + 10, y: current.y + current.height - 20 })
  await expect.poll(ignored).toBe(true)
  await placeCursor({ x: current.x + 80, y: current.y + 110 })
  await expect.poll(ignored).toBe(false)
  checks.push('unlock restores native mouse input without pointerenter; transparent margins remain click-through')
  await power('lock-screen');await power('suspend');await power('resume')
  expect(await visible()).toBe(false)
  await power('unlock-screen');expect(await visible()).toBe(true)
  await expect.poll(ignored).toBe(false)
  checks.push('resume while locked keeps the pet hidden until unlock')
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=dashboard')).close())
  await pet.mouse.move(80,110);await pet.mouse.down()
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','held')
  expect(await pet.locator('.pet-character').evaluate(e => e.hasPointerCapture(1))).toBe(true)
  await power('lock-screen')
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','idle')
  await expect.poll(() => pet.locator('.pet-character').evaluate(e => e.hasPointerCapture(1))).toBe(false)
  await power('unlock-screen');await pet.mouse.up()
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=dashboard')).isVisible())).toBe(false)
  current = await getBounds()
  await placeCursor({ x: current.x + 80, y: current.y + 110 })
  await pet.mouse.move(80,110);await pet.mouse.down();await pet.mouse.move(88,110)
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','held')
  await placeCursor({ x: current.x + 100, y: current.y + 10 })
  await expect.poll(async () => (await getBounds()).y).toBe(current.y - 100)
  await pet.mouse.up()
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','idle')
  await pet.screenshot({path:'artifacts/pet-unlocked.png',omitBackground:true})
  checks.push('locking a grabbed pet clears pointer capture; a stale release does not open the dashboard and the next drag works')
  expect(errors).toEqual([])
  writeFileSync('artifacts/pet-motion-report.json', JSON.stringify({ checks, errors, samples }, null, 2))
  console.log(JSON.stringify({ checks, errors }, null, 2))
} finally { if (application) await application.close() }
