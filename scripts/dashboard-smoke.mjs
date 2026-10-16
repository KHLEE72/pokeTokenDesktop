import { _electron as electronApp, expect } from './test-electron.mjs'
import electron from 'electron'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const directory = mkdtempSync(join(tmpdir(), 'poketoken-dashboard-'))
const data = join(directory, 'data')
const env = { ...process.env, POKETOKEN_DATA_DIR: data, POKETOKEN_TEST_MODE: '1' }
delete env.ELECTRON_RUN_AS_NODE
mkdirSync('artifacts', { recursive: true })
const errors = [], checks = [], widthLayouts = []
const scale = process.env.POKETOKEN_TEST_SCALE || 'native'
let application, page

async function start() {
  application = await electronApp.launch({ executablePath: process.env.POKETOKEN_EXE || electron, args: [...(process.env.POKETOKEN_EXE ? [] : ['.']), ...(scale === 'native' ? [] : [`--force-device-scale-factor=${scale}`])], env, timeout: 60000 })
  await application.firstWindow()
  await expect.poll(() => application.windows().some(p => p.url().includes('view=dashboard'))).toBe(true)
  page = application.windows().find(p => p.url().includes('view=dashboard'))
  page.on('pageerror', error => errors.push(error.message))
  await expect.poll(async () => Boolean((await page.evaluate(() => window.desktop.getSnapshot())).lastScan)).toBe(true)
  await page.evaluate(async () => { await document.fonts.ready })
}
const cardIds = () => page.locator('.dex-card').evaluateAll(cards => cards.map(card => Number(card.dataset.species)))
async function expectIds(ids) { await expect.poll(cardIds).toEqual(ids) }
async function reset() { await page.getByRole('button', { name: '필터 초기화', exact: true }).click() }
async function resize(width, height) {
  const expectedWidth = await application.evaluate(({ BrowserWindow }, size) => {
    const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=dashboard'))
    window.setSize(...size)
    return window.getContentBounds().width
  }, [width, height])
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(expectedWidth)
}
async function summaryFits({ closed = true } = {}) {
  await page.evaluate(() => window.scrollTo(0, 0))
  const layout = await page.evaluate(() => {
    const summary = document.querySelector('.activity-strip').getBoundingClientRect()
    const footer = document.querySelector('.home-footer').getBoundingClientRect()
    const controls = [...document.querySelectorAll('.home-grid button,.home-grid input')].map(el=>el.getBoundingClientRect())
    const grid=document.querySelector('.home-grid').getBoundingClientRect(),card=document.querySelector('.companion-card').getBoundingClientRect(),candy=document.querySelector('.candy-box').getBoundingClientRect()
    return { top: summary.top, bottom: summary.bottom, gridBottom:grid.bottom, cardBottom:card.bottom, candyBottom:candy.bottom, footerBottom: footer.bottom, height: innerHeight, width: innerWidth, scrollHeight: document.documentElement.scrollHeight, overflow: document.documentElement.scrollWidth > innerWidth, controlsInside: controls.every(r=>r.top>=0 && r.bottom<=innerHeight && r.right<=innerWidth) }
  })
  expect(layout.top).toBeGreaterThanOrEqual(0)
  expect(layout.bottom).toBeLessThanOrEqual(layout.height)
  expect(layout.overflow).toBe(false)
  expect(layout.top-Math.max(layout.cardBottom,layout.candyBottom),JSON.stringify(layout)).toBeGreaterThanOrEqual(6)
  expect(layout.controlsInside).toBe(true)
  if(closed) {
    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height)
    expect(layout.footerBottom).toBeLessThanOrEqual(layout.height)
  }
  return layout
}
async function storageWidthStaysStable() {
  const measure = () => page.evaluate(() => {
    const selectors = ['.workspace', '.topbar', '.page-heading', '.home-grid', '.companion-card', '.today-card', '.candy-box', '.activity-strip', '.egg-drawer']
    return Object.fromEntries(selectors.map(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect()
      return [selector, { left: rect.left, width: rect.width }]
    }))
  })
  await expect(page.locator('.egg-drawer')).not.toHaveAttribute('open')
  const closed = await measure()
  await page.locator('.egg-drawer > summary').click()
  await expect(page.locator('.egg-drawer')).toHaveAttribute('open')
  const opened = await measure()
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.locator('.egg-drawer > summary').click()
  await expect(page.locator('.egg-drawer')).not.toHaveAttribute('open')
  const reclosed = await measure()
  for (const [selector, rect] of Object.entries(closed)) {
    for (const state of [opened, reclosed]) {
      expect(Math.abs(state[selector].left - rect.left), `${selector} horizontal position`).toBeLessThanOrEqual(0.5)
      expect(Math.abs(state[selector].width - rect.width), `${selector} width`).toBeLessThanOrEqual(0.5)
    }
  }
  await summaryFits()
  return { closed, opened, reclosed }
}

try {
  await start()
  await page.evaluate(() => window.desktop.updateSettings({ roots: { claude: [], codex: [] }, paused: true, visible: false }))
  const fixture = (await page.evaluate(() => window.desktop.getSnapshot())).game
  const now = new Date().toISOString()
  fixture.pets = [
    { id: 'pet:1', family: 0, phase: 1, xp: 12500000, shiny: false, eggType: 'grass', obtainedAt: now },
    { id: 'pet:2', family: 1, phase: 3, xp: 0, shiny: false, eggType: 'fire', obtainedAt: now },
    { id: 'pet:3', family: 13, phase: 1, xp: 5000000, shiny: true, eggType: 'ghost', obtainedAt: now },
    { id: 'pet:4', family: 0, phase: 3, xp: 0, shiny: false, eggType: 'grass', obtainedAt: now },
    { id: 'pet:5', family: null, phase: 0, xp: 250000, shiny: false, eggType: 'fire', obtainedAt: null },
    { id: 'pet:6', family: null, phase: 0, xp: 375000, shiny: false, eggType: 'grass', obtainedAt: null },
    { id: 'pet:7', family: null, phase: 0, xp: 100000, shiny: false, eggType: null, obtainedAt: null },
    { id: 'pet:8', family: null, phase: 0, xp: 0, shiny: false, eggType: 'water', obtainedAt: null }
  ]
  Object.assign(fixture, {
    activeId: 'pet:1', displayPhase: 1, nextId: 9, owned: [1, 2, 3, 4, 5, 6], ownedShiny: [92],
    candyTokens: 400000, tokensEarned: 163000000,
    captures: [{ family: 1, petId: 'pet:2', shiny: false, completedAt: now }, { family: 0, petId: 'pet:4', shiny: false, completedAt: now }]
  })
  await application.close(); application = null
  const json = join(directory, 'fixture.json')
  writeFileSync(json, JSON.stringify(fixture))
  const seeded = spawnSync(electron, ['scripts/collection-fixture.cjs', join(data, 'poketoken.sqlite'), json], { env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit', windowsHide: true })
  expect(seeded.status).toBe(0)
  await start()
  await expect(page.locator('.egg-drawer')).not.toHaveAttribute('open')
  await expect(page.locator('.egg-drawer-heading')).toContainText('보관 중인 알 4개 · 부화 중 0개')
  await expect(page.locator('.egg-preview [data-egg-id="pet:5"]')).toHaveText('불꽃타입 알50.0%')
  await expect(page.locator('.egg-preview [data-egg-id="pet:6"]')).toHaveText('풀타입 알75.0%')
  await expect(page.locator('.egg-preview [data-egg-id="pet:7"]')).toHaveText('기존 알20.0%')
  await expect(page.locator('.egg-preview-more')).toHaveText('+1개 더 보기')
  await expect.poll(() => page.locator('.candy-box img[data-item="rare-candy"]').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true)
  expect(await page.evaluate(() => document.fonts.check('12px Galmuri') && document.fonts.check('10px "Galmuri Small"'))).toBe(true)
  for (const language of ['en', 'ja', 'ko']) {
    for (const theme of ['dark', 'light']) {
      await page.evaluate(settings => window.desktop.updateSettings(settings), { language, theme })
      await expect(page.locator('html')).toHaveAttribute('lang', language)
      await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', theme)
      for (const size of [[1040, 800], [850, 680]]) {
        await resize(...size)
        widthLayouts.push({ language, theme, size, ...await storageWidthStaysStable() })
      }
    }
  }
  await resize(1040, 800)
  checks.push('opening and closing egg storage preserves the horizontal positions and widths of nine dashboard regions in all three languages, light/dark themes and default/minimum windows')
  const normalLayout = await summaryFits()
  await page.screenshot({ path: 'artifacts/dashboard-home.png' })
  await resize(850, 680)
  await page.screenshot({ path: 'artifacts/dashboard-home-compact.png' })
  const compactLayout = await summaryFits()
  await page.locator('.egg-drawer > summary').click()
  await expect(page.getByRole('button', { name: /알 선택$/ })).toHaveCount(18)
  await expect(page.getByRole('progressbar', { name: '불꽃타입 알 부화 진행률' })).toHaveAttribute('aria-valuenow','50')
  await expect(page.getByRole('progressbar', { name: '풀타입 알 부화 진행률' })).toHaveAttribute('aria-valuenow','75')
  await expect(page.getByRole('progressbar', { name: '물타입 알 부화 진행률' })).toHaveAttribute('aria-valuenow','0')
  await expect(page.getByRole('progressbar', { name: '기존 알 부화 진행률' })).toHaveAttribute('aria-valuenow','20')
  await expect(page.locator('[data-egg-type="electric"] .egg-choice-status')).toHaveText('새 알')
  await expect(page.locator('[data-egg-type="electric"] .egg-progress-track')).toHaveCount(0)
  await page.screenshot({path:'artifacts/dashboard-egg-storage.png',fullPage:true})
  await page.getByRole('button', { name: '불꽃타입 알 선택', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.desktop.getSnapshot())).game.activeId).toBe('pet:5')
  const switched = await page.evaluate(() => window.desktop.getSnapshot())
  expect(switched.game.activeId).toBe('pet:5')
  expect(switched.game.pets.find(p => p.id === 'pet:1').xp).toBe(12500000)
  await expect(page.getByRole('button', { name: '사탕 먹이기', exact: true })).toBeDisabled()
  await expect(page.locator('.egg-drawer-heading')).toContainText('보관 중인 알 3개 · 부화 중 1개')
  await expect(page.locator('.egg-preview [data-egg-id="pet:5"]')).toHaveText('불꽃타입 알50.0%')
  await page.locator('.egg-drawer > summary').click()
  const eggLayout = await summaryFits()
  await page.locator('.egg-drawer > summary').click()
  await page.getByRole('button',{name:'기존 알 이어 키우기',exact:true}).click()
  await expect(page.locator('.egg-preview [data-egg-id="pet:7"]')).toHaveText('기존 알20.0%')
  await page.locator('.egg-drawer > summary').click()
  await page.evaluate(() => window.desktop.gameAction({ type: 'select', petId: 'pet:2', phase: 3 }))
  await expect(page.locator('.companion-description h2')).toHaveText('리자몽')
  const completedLayout = await summaryFits()
  await page.evaluate(() => window.desktop.gameAction({ type: 'select', petId: 'pet:1', phase: 1 }))
  checks.push('the entire closed home fits the default and minimum windows without vertical or horizontal scrolling; all buttons remain visible for growing, egg and completed pets')
  checks.push('collapsed storage previews the active/highest-progress eggs and remaining count; expanded storage exposes all 18 types, zero XP and legacy progress without losing growth')

  await page.getByRole('button',{name:'보라시티 다크 모드로 변경',exact:true}).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme','dark')
  await summaryFits()
  await page.screenshot({path:'artifacts/dashboard-home-dark-compact.png'})
  await page.locator('.egg-drawer > summary').click()
  expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)).toBe(true)
  const scrollbar = await page.evaluate(()=>({width:getComputedStyle(document.documentElement,'::-webkit-scrollbar').width,thumb:getComputedStyle(document.documentElement,'::-webkit-scrollbar-thumb').backgroundColor}))
  expect(scrollbar.width).toBe('12px')
  expect(['rgb(102, 83, 131)','rgb(151, 118, 190)']).toContain(scrollbar.thumb)
  await page.screenshot({path:'artifacts/dashboard-egg-storage-dark.png',fullPage:true})
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
  await page.locator('.egg-drawer > summary').click()
  await summaryFits()
  await resize(1040,800)
  await summaryFits()
  await page.screenshot({path:'artifacts/dashboard-home-dark.png'})
  await page.locator('.egg-drawer > summary').click()
  await page.evaluate(async()=>{
    const types=[...document.querySelectorAll('.egg-choice')].map(el=>el.dataset.eggType).filter(t=>t!=='legacy')
    for(const eggType of types)await window.desktop.gameAction({type:'egg',eggType})
    await window.desktop.gameAction({type:'select',petId:'pet:1',phase:1})
  })
  await page.locator('.egg-drawer > summary').click()
  await expect(page.locator('.egg-preview-item')).toHaveCount(3)
  await expect(page.locator('.egg-preview-more')).toHaveText('+16개 더 보기')
  for(const size of [[850,680],[900,700],[1040,800],[1440,900]]) { await resize(...size); await summaryFits() }
  await resize(1040,800)
  const beforeTheme = await page.evaluate(()=>window.desktop.getSnapshot())
  await expect(page.evaluate(()=>window.desktop.updateSettings({theme:'invalid'}))).rejects.toThrow('잘못된 화면 테마')
  await application.close();application=null
  await start()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme','dark')
  const afterTheme = await page.evaluate(()=>window.desktop.getSnapshot())
  expect(afterTheme.game).toEqual(beforeTheme.game)
  expect(afterTheme.settings.roots).toEqual(beforeTheme.settings.roots)
  await summaryFits()
  await resize(850,680)
  checks.push('Lavender dark mode switches from the toolbar, survives restart, preserves saved growth and roots, rejects invalid themes, and uses the purple pixel scrollbar only on scrollable pages')

  await page.getByRole('button', { name: '나의 도감', exact: false }).first().click()
  await expect(page.locator('.candy-box')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'사탕 먹이기',exact:true})).toHaveCount(0)
  const search = page.getByRole('searchbox', { name: '포켓몬 이름 또는 도감 번호 검색' })
  const type = page.getByRole('combobox', { name: '도감 타입 필터' })
  const status = page.getByRole('combobox', { name: '도감 상태 필터' })
  const topPager = page.getByRole('navigation', { name: '도감 위쪽 페이지 이동' })
  const bottomPager = page.getByRole('navigation', { name: '도감 아래쪽 페이지 이동' })
  const pageSelect = topPager.getByRole('combobox', { name: '이동할 도감 페이지' })
  const generation=page.getByRole('combobox',{name:'도감 세대 필터'})
  await generation.selectOption('1')
  await expectIds([1, 2, 3, 4, 5, 6, 7, 8, 9])
  await expect(topPager.getByRole('button', { name: '이전 페이지', exact: true })).toBeDisabled()
  await topPager.getByRole('button', { name: '다음 페이지', exact: true }).click()
  await expect(pageSelect).toHaveValue('2')
  await expect(page.locator('.dex-card')).toHaveCount(9)
  await bottomPager.getByRole('button', { name: '이전 페이지', exact: true }).click()
  await expect(pageSelect).toHaveValue('1')
  await expect.poll(() => page.locator('.dex-toolbar').evaluate(el => Math.abs(el.getBoundingClientRect().top - 16))).toBeLessThanOrEqual(1)
  const allIds = []
  for (let n = 1; n <= 17; n++) {
    await pageSelect.selectOption(String(n))
    await expect(pageSelect).toHaveValue(String(n))
    await expect(bottomPager.getByRole('combobox', { name: '이동할 도감 페이지' })).toHaveValue(String(n))
    await expect(page.locator('.dex-card')).toHaveCount(n === 17 ? 7 : 9)
    allIds.push(...await cardIds())
  }
  expect(allIds).toHaveLength(151)
  expect(new Set(allIds).size).toBe(151)
  await expect(topPager.getByRole('button', { name: '다음 페이지', exact: true })).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('145–151종')
  await page.screenshot({ path: 'artifacts/dashboard-dex-last-page.png', fullPage: true })
  checks.push('nine cards per page; all 151 first-generation species appear once across 17 pages; last-page remainder, direct jump, both pagers, boundaries and scroll position work')
  await search.fill(' 이상 해 '); await expectIds([1, 2, 3])
  await expect(pageSelect).toHaveValue('1')
  await search.fill(' No. 004 '); await expectIds([4])
  await search.fill('#006'); await expectIds([6])
  await page.getByRole('button', { name: '검색어 지우기', exact: true }).click()
  await expect(page.locator('.dex-card')).toHaveCount(9)
  await pageSelect.selectOption('6')
  await type.selectOption('electric'); await expectIds([25,26,81,82,100,101,125,135,145])
  await expect(pageSelect).toHaveValue('1')
  await type.selectOption('flying')
  expect(await cardIds()).toContain(6)
  await type.selectOption('fire'); await expectIds([4,5,6,37,38,58,59,77,78])
  await status.selectOption('discovered'); await search.fill('리자'); await expectIds([5, 6])
  await search.fill('없는 포켓몬')
  await expect(page.getByRole('heading', { name: '조건에 맞는 친구가 없어요' })).toBeVisible()
  await expect(page.locator('.dex-pagination')).toHaveCount(0)
  await page.getByRole('button', { name: '전체 도감 보기', exact: true }).click()
  await expect(page.locator('.dex-card')).toHaveCount(9)
  await expect(search).toHaveValue(''); await expect(type).toHaveValue('all'); await expect(status).toHaveValue('all')
  checks.push('name and padded number search, secondary types, combined filters, clearing and empty-state reset work')

  await pageSelect.selectOption('6')
  await page.getByRole('button', { name: '✦ 이로치 도감', exact: true }).click()
  await expect(pageSelect).toHaveValue('1')
  await expect(page.locator('.dex-card')).toHaveCount(9)
  await page.getByRole('button', { name: '일반 도감', exact: true }).click()
  await pageSelect.selectOption('6')
  await status.selectOption('discovered'); await expectIds([1, 2, 3, 4, 5, 6])
  await expect(pageSelect).toHaveValue('1')
  await status.selectOption('undiscovered'); await expect(page.locator('.dex-card')).toHaveCount(9)
  await expect(page.getByRole('status')).toContainText('전체 1019종')
  await pageSelect.selectOption('114')
  await expect(page.locator('.dex-card')).toHaveCount(2)
  await status.selectOption('growing'); await expectIds([1])
  await expect(pageSelect).toHaveValue('1')
  await expect(page.locator('.dex-badge')).toContainText('25.0%')
  await status.selectOption('complete'); await expectIds([1, 2, 3, 4, 5, 6])
  await expect(page.locator('.dex-card[data-species="1"] .dex-badge')).toContainText('진화 완료')
  await status.selectOption('active'); await expectIds([1])
  await expect(page.getByRole('combobox', { name: '이상해씨 개체 선택' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '이상해씨 선택', exact: true })).toHaveText('함께하는 중')
  await status.selectOption('discovered')
  await page.getByRole('button', { name: '✦ 이로치 도감', exact: true }).click(); await expectIds([92])
  await type.selectOption('poison'); await expectIds([92])
  await page.screenshot({ path: 'artifacts/dashboard-dex-shiny.png' })
  await page.getByRole('button', { name: '일반 도감', exact: true }).click(); await expectIds([1, 2, 3])
  await status.selectOption('active'); await expectIds([1])
  checks.push('status filters use the selected variant; duplicate individuals show the matching growth state and the active pet remains accurate')

  await reset()
  const buttonsBelowStatus = await page.locator('.dex-card').evaluateAll(cards => cards.every(card => {
    const badge = card.querySelector('.dex-badge').getBoundingClientRect()
    const button = card.querySelector('.button').getBoundingClientRect()
    return button.top >= badge.bottom && button.left >= card.getBoundingClientRect().left && button.right <= card.getBoundingClientRect().right
  }))
  expect(buttonsBelowStatus).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.screenshot({ path: 'artifacts/dashboard-dex-compact.png' })
  await resize(1040, 800)
  await page.screenshot({ path: 'artifacts/dashboard-dex.png', fullPage: true })
  await status.selectOption('growing')
  await page.screenshot({ path: 'artifacts/dashboard-dex-filtered.png' })
  checks.push('all collection buttons sit below their status and fit inside cards at the minimum window width')
  await page.getByRole('button', { name: '설정', exact: false }).first().click()
  await expect(page.getByRole('heading', { name: '함께하는 방식' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.screenshot({ path: 'artifacts/dashboard-settings.png', fullPage: true })
  await page.getByRole('button',{name:'몬스터볼 라이트 테마',exact:true}).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme','light')
  await page.screenshot({path:'artifacts/dashboard-settings-light.png',fullPage:true})
  await page.getByRole('button',{name:'보라시티 다크 테마',exact:true}).click()
  checks.push('local pixel fonts and the candy sprite load; themed home, dex and settings render without horizontal overflow')
  expect(errors).toEqual([])
  const report = { checks, errors, scale, widthLayouts, normalLayout, compactLayout, eggLayout, completedLayout }
  writeFileSync('artifacts/dashboard-report.json', JSON.stringify(report, null, 2))
  writeFileSync(`artifacts/dashboard-report-${scale}.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ checks, errors, scale, storageWidthScenarios: widthLayouts.length, normalLayout, compactLayout, eggLayout, completedLayout }, null, 2))
} finally { if (application) await application.close() }
