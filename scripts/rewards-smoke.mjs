import { _electron as electronApp, expect } from './test-electron.mjs'
import electron from 'electron'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { currentPet } from './current-pet.mjs'
const directory = mkdtempSync(join(tmpdir(), 'poketoken-rewards-')), data = join(directory, 'data'), logs = join(directory, 'logs')
mkdirSync(logs); mkdirSync('artifacts', { recursive: true })
const env = { ...process.env, POKETOKEN_DATA_DIR: data, POKETOKEN_TEST_MODE: '1' }; delete env.ELECTRON_RUN_AS_NODE
const scale = process.env.POKETOKEN_TEST_SCALE || 'native'
const checks = [], errors = []
let application, page, pet
async function start() {
  application = await electronApp.launch({ executablePath: process.env.POKETOKEN_EXE || electron, args: [...(process.env.POKETOKEN_EXE ? [] : ['.']), ...(scale === 'native' ? [] : [`--force-device-scale-factor=${scale}`])], env, timeout: 60000 })
  await application.firstWindow()
  await expect.poll(() => application.windows().some(w => w.url().includes('view=pet'))).toBe(true)
  page = application.windows().find(w => w.url().includes('view=dashboard')); pet = application.windows().find(w => w.url().includes('view=pet'))
  page.on('pageerror', e => errors.push(e.message)); pet.on('pageerror', e => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(async () => Boolean((await snapshot()).lastScan)).toBe(true)
  await page.evaluate(async () => { await document.fonts.ready; await window.desktop.updateSettings({ paused: true }) })
}
const snapshot = () => page.evaluate(() => window.desktop.getSnapshot())
const nav = tab => page.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: tab, exact: false }).click()
const capture = async name => { await expect(page.locator('.theme-button')).toBeEnabled(); return page.screenshot({ path: `artifacts/rewards-${name}.png`, fullPage: name === 'unlocked' || name === 'locked' }) }
const row = (id, tokens) => JSON.stringify({ type: 'assistant', timestamp: new Date(Date.now() + 1000).toISOString(), message: { id, usage: { input_tokens: tokens } } }) + '\n'
async function fits() {
  await expect.poll(() => page.evaluate(() => ({ horizontal: document.documentElement.scrollWidth <= innerWidth, vertical: document.documentElement.scrollHeight === innerHeight, actions: [...document.querySelectorAll('.companion-actions button')].every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }) }))).toEqual({ horizontal: true, vertical: true, actions: true })
}
try {
  await start()
  await nav('업적'); expect(await page.locator('.achievement-card').count()).toBe(6)
  expect((await snapshot()).rewards.unlocked).toEqual({})
  await capture('locked')
  const locked = await page.evaluate(async () => { try { await window.desktop.updateSettings({ theme: 'luxury' }); return false } catch { return true } })
  expect(locked).toBe(true)
  await nav('설정'); await page.getByRole('button', { name: '럭셔리볼 테마 획득 조건 보기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '작은 발자국, 새로운 볼' })).toBeVisible()
  checks.push('achievement progress and locked theme previews render; locked themes are rejected by IPC/storage and navigate to their requirements')
  const file = join(logs, 'usage.jsonl'); writeFileSync(file, row('baseline', 100_000_000))
  await page.evaluate(logs => window.desktop.updateSettings({ roots: { claude: [logs], codex: [] } }), logs)
  expect((await snapshot()).rewards.unlocked).toEqual({})
  appendFileSync(file, row('new', 1_000_000)); await page.evaluate(() => window.desktop.refresh())
  expect((await snapshot()).rewards.unlocked.great).toBeTruthy()
  await expect(page.locator('.reward-toast')).toContainText('슈퍼볼')
  const unlocked = (await snapshot()).rewards.unlocked
  await page.evaluate(() => window.desktop.refresh()); expect((await snapshot()).rewards.unlocked).toEqual(unlocked)
  checks.push('historical baselines do not award balls; new token usage unlocks a ball/theme together with a short notification exactly once')
  await nav('현재 펫'); const activeId = (await snapshot()).game.activeId
  await page.getByRole('combobox', { name: '현재 친구의 볼 선택', exact: true }).selectOption('great')
  await expect.poll(async () => (await snapshot()).game.pets.find(p => p.id === activeId).ball).toBe('great')
  await page.getByRole('button', { name: '볼에 넣기', exact: true }).click()
  await expect(pet.locator('.pet-surface')).toHaveAttribute('data-in-ball', 'true')
  await expect(pet.locator('.ball-icon')).toHaveAttribute('data-ball', 'great')
  await expect.poll(() => application.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet')); return { width: w.getContentBounds().width, focusable: w.isFocusable(), focused: w.isFocused() } })).toEqual({ width: 88, focusable: false, focused: false })
  await pet.screenshot({ path: 'artifacts/rewards-desktop-ball.png', omitBackground: true })
  const resting = await application.evaluate(({ screen, BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=pet')); const b = w.getContentBounds(); globalThis.ballCursor = { x: b.x + 44, y: b.y + 94 }; screen.getCursorScreenPoint = () => globalThis.ballCursor; return b })
  await pet.mouse.move(44,94); await pet.mouse.down()
  await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','held')
  await application.evaluate(() => { globalThis.ballCursor = { x: globalThis.ballCursor.x + 70, y: globalThis.ballCursor.y - 80 } })
  await expect.poll(() => application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).getContentBounds().x)).toBe(resting.x + 70)
  await pet.mouse.up(); await expect(pet.locator('.pet-character')).toHaveAttribute('data-motion','idle')
  await expect(pet.locator('.pet-surface')).toHaveAttribute('data-in-ball','true')
  const previousPet = pet
  await application.evaluate(({powerMonitor}) => { powerMonitor.emit('lock-screen'); powerMonitor.emit('unlock-screen') })
  pet = await currentPet(application, previousPet)
  pet.on('pageerror', e => errors.push(e.message))
  await expect(pet.locator('.pet-surface')).toHaveAttribute('data-in-ball','true')
  await expect.poll(() => application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).getContentBounds().width)).toBe(88)
  await application.evaluate(({BrowserWindow}) => { const b=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).getContentBounds(); globalThis.ballCursor={x:b.x+44,y:b.y+94} })
  await pet.mouse.move(44, 94); await pet.mouse.down(); await pet.mouse.up()
  await expect(pet.locator('.pet-surface')).toHaveAttribute('data-in-ball', 'false')
  expect((await snapshot()).settings.paused).toBe(true)
  await nav('설정'); await page.getByRole('button', { name: '슈퍼볼 테마', exact: true }).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'great')
  await capture('great-theme')
  checks.push('individual ball choice persists independently of the theme; a compact unfocused desktop ball drags and falls without summoning, survives simulated session recovery, summons on a short click and keeps pause settings')
  await application.close(); application = null
  await start(); expect((await snapshot()).settings.theme).toBe('great'); expect((await snapshot()).game.pets.find(p => p.id === activeId).ball).toBe('great')
  expect((await snapshot()).rewards.unlocked).toEqual(unlocked); await expect(page.locator('.reward-toast')).toHaveCount(0)
  const game = (await snapshot()).game
  game.tokensEarned = 200_000_000; game.owned = [1,2,3,92,93,94]; game.ownedShiny = [133]
  const current = game.pets.find(p => p.id === game.activeId)
  Object.assign(current, { phase: 3, family: 0, path: [1,2,3], xp: 0, ball: 'great' })
  game.captures = [{ family: 0, completedAt: new Date().toISOString(), petId: activeId, shiny: false, speciesId: 3 }]
  await application.close(); application = null
  const fixture = join(directory, 'fixture.json'); writeFileSync(fixture, JSON.stringify(game))
  const seeded = spawnSync(electron, ['scripts/collection-fixture.cjs', join(data, 'poketoken.sqlite'), fixture], { env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: 'inherit' }); expect(seeded.status).toBe(0)
  await start(); expect((await snapshot()).game).toEqual(game)
  expect(Object.keys((await snapshot()).rewards.unlocked).sort()).toEqual(['dusk','great','luxury','premier','ultra'])
  await nav('업적'); await capture('unlocked')
  checks.push('restart restores rewards without repeated toasts; earlier final evolution, shiny and ghost records backfill rewards without changing the save')
  await nav('설정')
  const palettes = []
  for (const [theme, name] of [['light','몬스터볼 라이트'],['dark','보라시티 다크'],['great','슈퍼볼'],['ultra','하이퍼볼'],['premier','프리미어볼'],['luxury','럭셔리볼'],['dusk','다크볼']]) {
    await page.getByRole('button', { name: `${name} 테마`, exact: true }).click()
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', theme)
    palettes.push(await page.locator('.app-shell').evaluate(el => getComputedStyle(el).backgroundColor))
    await capture(`${theme}-theme`)
  }
  expect(new Set(palettes).size).toBe(7)
  await page.getByRole('button', { name: '럭셔리볼 테마', exact: true }).click()
  await expect(page.locator('.theme-button')).toBeEnabled()
  await nav('현재 펫')
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=dashboard')).setSize(850,680))
  await fits(); await capture('minimum-home')
  await page.getByRole('button', { name: '볼에 넣기', exact: true }).click()
  await nav('나의 도감'); await page.locator(`select[data-pet-id="${activeId}"]`).first().selectOption('luxury')
  await expect.poll(async () => (await snapshot()).game.pets.find(p => p.id === activeId).ball).toBe('luxury')
  expect((await snapshot()).settings.theme).toBe('luxury')
  await pet.screenshot({ path: 'artifacts/rewards-luxury-ball.png', omitBackground: true })
  await nav('현재 펫'); await page.locator('.egg-drawer > summary').click(); await page.getByRole('button', { name: '불꽃타입 알 선택', exact: true }).click()
  expect((await snapshot()).settings.inBall).toBe(false)
  expect((await snapshot()).game.pets.find(p => p.id === activeId).ball).toBe('luxury')
  checks.push('all available theme palettes are distinct, the minimum-size home fits, inactive individuals can equip balls, and egg selection leaves ball mode safely')
  await nav('나의 도감')
  const ids=JSON.parse(readFileSync('src/shared/catalog-data.json','utf8')).pokemon.map(p=>p.id)
  expect(new Set(ids).size).toBe(1025)
  const completedGame = (await snapshot()).game; completedGame.owned = [...new Set(ids)]
  await application.close(); application = null
  writeFileSync(fixture, JSON.stringify(completedGame))
  const complete = spawnSync(electron, ['scripts/collection-fixture.cjs', join(data,'poketoken.sqlite'),fixture], {env:{...env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:'inherit'}); expect(complete.status).toBe(0)
  await start(); expect((await snapshot()).rewards.unlocked.master).toBeTruthy()
  await nav('설정'); await page.getByRole('button',{name:'마스터볼 테마',exact:true}).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme','master'); await capture('master-theme')
  checks.push('completing the 1,025-species collection unlocks Master Ball and its theme, preserves existing individuals and persists the new reward')
  expect(errors).toEqual([])
  writeFileSync(`artifacts/rewards-report${scale === 'native' ? '' : `-${scale}`}.json`, JSON.stringify({ executablePath: process.env.POKETOKEN_EXE || electron, scale, checks, errors }, null, 2))
  console.log(JSON.stringify({ checks, errors }, null, 2))
} finally { if (application) await application.close() }
