import { chromium, expect } from '@playwright/test'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
if(process.platform!=='win32')throw new Error('Run the portable executable check on Windows.')
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const port=server.address().port;await new Promise(resolve=>server.close(resolve))
const directory=mkdtempSync(join(tmpdir(),'poketoken-portable-')),logs=join(directory,'logs');mkdirSync(logs)
const version=JSON.parse(readFileSync('package.json','utf8')).version
const executable=resolve(`release/PokeToken-Desktop-${version}-win-x64.exe`)
const env={...process.env,POKETOKEN_DATA_DIR:join(directory,'data'),POKETOKEN_TEST_MODE:'1'};delete env.ELECTRON_RUN_AS_NODE
const child=spawn(executable,[`--remote-debugging-port=${port}`],{env,windowsHide:true,stdio:'ignore'})
let browser,applicationPid
try{
  await expect.poll(async()=>{try{return(await fetch(`http://127.0.0.1:${port}/json/version`)).ok}catch{return false}},{timeout:60_000}).toBe(true)
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const session=await browser.newBrowserCDPSession()
  const processes=await session.send('SystemInfo.getProcessInfo')
  applicationPid=processes.processInfo.find(process=>process.type==='browser').id
  await expect.poll(()=>browser.contexts()[0].pages().some(page=>page.url().includes('view=dashboard'))).toBe(true)
  const page=browser.contexts()[0].pages().find(page=>page.url().includes('view=dashboard'))
  await expect(page.locator('html')).toHaveAttribute('lang','en')
  await page.evaluate(()=>window.desktop.updateSettings({language:'ko'}))
  await expect(page.getByRole('heading',{name:'오늘도, 함께 성장해요'})).toBeVisible()
  const expectedBundle=readFileSync('out/renderer/index.html','utf8').match(/src="[^\"]*\/([^/\"]+\.js)"/)[1]
  expect(await page.locator('script[type="module"][src]').getAttribute('src')).toContain(expectedBundle)
  await page.evaluate(async()=>{await document.fonts.ready})
  expect(await page.evaluate(()=>document.fonts.check('12px Galmuri')&&document.fonts.check('10px "Galmuri Small"'))).toBe(true)
  await expect.poll(()=>page.locator('.candy-box img[data-item="rare-candy"]').evaluate(img=>img.complete&&img.naturalWidth>0&&img.src.startsWith('data:'))).toBe(true)
  await expect.poll(()=>page.evaluate(async()=>{const s=await window.desktop.getSnapshot();return !s.scanning&&s.lastScan!==null})).toBe(true)
  await page.evaluate(()=>window.desktop.updateSettings({paused:true}))
  const file=join(logs,'test.jsonl')
  const line=(id,input)=>JSON.stringify({type:'assistant',timestamp:new Date(Date.now()+1000).toISOString(),requestId:'portable',message:{id,usage:{input_tokens:input}}})+'\n'
  writeFileSync(file,line('baseline',500_000))
  await page.evaluate(path=>window.desktop.updateSettings({roots:{claude:[path],codex:[]}}),logs)
  expect((await page.evaluate(()=>window.desktop.getSnapshot())).game.tokensEarned).toBe(0)
  appendFileSync(file,line('after-part-1',250_000))
  await page.evaluate(()=>window.desktop.refresh())
  await expect(page.locator('.egg-preview')).toContainText('풀타입 알50.0%')
  await expect(page.locator('.egg-preview-item').filter({hasText:'풀타입 알'})).toHaveAttribute('title','부화 중')
  await page.locator('.egg-drawer > summary').click()
  await page.getByRole('button',{name:'불꽃타입 알 선택',exact:true}).click()
  await expect(page.locator('.egg-preview')).toContainText('풀타입 알50.0%')
  await expect(page.locator('.egg-preview-item').filter({hasText:'풀타입 알'})).toHaveAttribute('title','보관 중')
  await expect(page.locator('.egg-preview')).toContainText('불꽃타입 알0.0%')
  await page.getByRole('button',{name:'풀타입 알 선택',exact:true}).click()
  await expect(page.locator('.egg-preview')).toContainText('풀타입 알50.0%')
  await expect(page.locator('.egg-preview-item').filter({hasText:'풀타입 알'})).toHaveAttribute('title','부화 중')
  await page.locator('.egg-drawer > summary').click()
  appendFileSync(file,line('after-part-2',250_000))
  await page.evaluate(()=>window.desktop.refresh())
  const state=await page.evaluate(()=>window.desktop.getSnapshot())
  expect(state.game.pets.find(p=>p.id===state.game.activeId).phase).toBe(1);expect(state.game.tokensEarned).toBe(500_000)
  await expect(page.locator('.habitat-sprite img')).toBeVisible({timeout:30_000})
  await page.screenshot({path:'artifacts/portable-home.png'})
  const petPage=browser.contexts()[0].pages().find(page=>page.url().includes('view=pet'))
  await petPage.screenshot({path:'artifacts/pet.png',omitBackground:true})
  const png=readFileSync('artifacts/pet.png'),chunks=[]
  expect(png[25]).toBe(6)
  for(let offset=8;offset<png.length;){const length=png.readUInt32BE(offset);if(png.toString('ascii',offset+4,offset+8)==='IDAT')chunks.push(png.subarray(offset+8,offset+8+length));offset+=length+12}
  // The first pixel has zero preceding/filter pixels; its fourth byte is its alpha.
  expect(inflateSync(Buffer.concat(chunks))[4]).toBe(0)
  await expect(petPage.locator('.pet-character')).toHaveAttribute('data-motion','idle')
  await petPage.mouse.move(80,110);await petPage.mouse.down()
  await expect(petPage.locator('.pet-character')).toHaveAttribute('data-motion','held')
  await expect(petPage.locator('.pet-bubble')).toHaveAttribute('data-dialogue','held')
  await petPage.mouse.up()
  await expect(petPage.locator('.pet-character')).toHaveAttribute('data-motion','idle')
  await expect(petPage.locator('.pet-bubble')).toHaveAttribute('data-dialogue','petting')
  await expect(petPage.locator('.pet-affection')).toBeVisible()
  await page.getByRole('button',{name:'볼에 넣기',exact:true}).click()
  await expect(petPage.locator('.pet-surface')).toHaveAttribute('data-in-ball','true')
  await expect.poll(()=>petPage.evaluate(()=>innerWidth)).toBe(88)
  await petPage.mouse.move(44,94);await petPage.mouse.down();await petPage.mouse.up()
  await expect(petPage.locator('.pet-surface')).toHaveAttribute('data-in-ball','false')
  await expect(page.locator('.egg-drawer')).not.toHaveAttribute('open')
  expect(await page.locator('.activity-strip').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight)).toBe(true)
  await page.getByRole('button',{name:'나의 도감',exact:false}).first().click()
  await expect(page.locator('.candy-box')).toHaveCount(0)
  await page.getByRole('searchbox',{name:'포켓몬 이름 또는 도감 번호 검색'}).fill('No. 025')
  await page.getByRole('combobox',{name:'도감 타입 필터'}).selectOption('electric')
  await page.getByRole('combobox',{name:'도감 상태 필터'}).selectOption('undiscovered')
  await expect(page.locator('.dex-card')).toHaveCount(1)
  await expect(page.locator('.dex-card')).toHaveAttribute('data-species','25')
  expect(await page.locator('.dex-card').evaluate(el=>el.querySelector('.button').getBoundingClientRect().top>=el.querySelector('.dex-badge').getBoundingClientRect().bottom)).toBe(true)
  await page.screenshot({path:'artifacts/portable-dex.png'})
  await page.getByRole('button',{name:'필터 초기화',exact:true}).click()
  await expect(page.locator('.dex-card')).toHaveCount(9)
  const pager=page.getByRole('navigation',{name:'도감 위쪽 페이지 이동'})
  await expect(pager.getByRole('button',{name:'이전 페이지',exact:true})).toBeDisabled()
  await pager.getByRole('combobox',{name:'이동할 도감 페이지'}).selectOption('7')
  await expect(page.locator('.dex-card')).toHaveCount(7)
  await expect(pager.getByRole('button',{name:'다음 페이지',exact:true})).toBeDisabled()
  await page.getByRole('searchbox',{name:'포켓몬 이름 또는 도감 번호 검색'}).fill('No. 025')
  await expect(page.locator('.dex-card')).toHaveCount(1)
  await expect(pager.getByRole('combobox',{name:'이동할 도감 페이지'})).toHaveValue('1')
  writeFileSync('artifacts/portable-report.json',JSON.stringify({executable,checks:['portable launcher extracted and started','packaged preload, worker, SQLite and tray resources loaded','historical baseline excluded','new usage hatches through packaged IPC','runtime sprite download displayed','pet background is transparent (PNG alpha verified)','immediate hold and petting reaction work in the portable executable','updated home summary and egg drawer render in the portable executable','packaged dex search, combined filters, reset and button placement work','nine cards per page, last-page remainder, boundaries and search page reset work in the portable executable','bundled pixel fonts and the local candy sprite render in the portable executable','stored egg types and progress remain visible across switching; the dex has no duplicate candy panel'],errors:[]},null,2))
  const reportPath='artifacts/portable-report.json',report=JSON.parse(readFileSync(reportPath,'utf8'))
  report.checks.push('portable payload contains the exact renderer bundle from the latest source build','portable pet recalls into a compact ball and summons again on a short click')
  writeFileSync(reportPath,JSON.stringify(report,null,2))
  console.log('Portable executable checks passed.')
}finally{
  if(browser)await browser.close().catch(()=>{})
  // Only terminate the browser PID obtained from this test's unique debugging endpoint.
  if(applicationPid)try{execFileSync('taskkill',['/PID',String(applicationPid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}
  else if(child.pid)try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}
}
