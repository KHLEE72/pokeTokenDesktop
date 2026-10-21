import { _electron,expect } from '@playwright/test'
import electron from 'electron'
import { spawnSync } from 'node:child_process'
import { mkdirSync,mkdtempSync,readFileSync,writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const directory=mkdtempSync(join(tmpdir(),'poketoken-league-ui-')),data=join(directory,'data'),fixture=join(directory,'game.json'),feed=join(directory,'releases.json'),catalog=JSON.parse(readFileSync('src/shared/league-catalog.json','utf8'))
mkdirSync('artifacts',{recursive:true})
const env={...process.env,POKETOKEN_DATA_DIR:data,POKETOKEN_TEST_MODE:'1',POKETOKEN_UPDATE_FIXTURE:feed};delete env.ELECTRON_RUN_AS_NODE
const os=process.platform==='darwin'?`mac-${process.arch}.dmg`:'Setup-x64.exe',name=`PokeToken-Desktop-9.9.9-${os}`
writeFileSync(feed,JSON.stringify([{tag_name:'v9.9.9',assets:[{name,browser_download_url:`https://github.com/KHLEE72/pokeTokenShimeji/releases/download/v9.9.9/${name}`}]}]))
const scale=process.env.POKETOKEN_TEST_SCALE||'native',checks=[],errors=[],layouts=[]
let application,page
const snapshot=()=>page.evaluate(()=>window.desktop.getSnapshot())
const nav=async tab=>{await page.locator(`.sidebar nav button[data-tab="${tab}"]`).click();await page.evaluate(()=>scrollTo(0,0))}
async function start(){
 application=await _electron.launch({executablePath:process.env.POKETOKEN_EXE||electron,args:[...(process.env.POKETOKEN_EXE?[]:['.']),...(scale==='native'?[]:[`--force-device-scale-factor=${scale}`])],env,timeout:60000})
 application.process().stderr?.on('data',chunk=>{const text=String(chunk);if(/Object has been destroyed|UnhandledPromiseRejection|Error occurred in handler for 'update:action'/.test(text))errors.push(text)})
 await application.firstWindow();await expect.poll(()=>application.windows().some(p=>p.url().includes('view=dashboard'))).toBe(true)
 page=application.windows().find(p=>p.url().includes('view=dashboard'));page.on('pageerror',e=>errors.push(e.message))
 await expect.poll(async()=>Boolean((await snapshot()).lastScan)).toBe(true);await page.evaluate(()=>document.fonts.ready)
}
async function seed(game){await application.close();application=null;writeFileSync(fixture,JSON.stringify(game));expect(spawnSync(electron,['scripts/collection-fixture.cjs',join(data,'poketoken.sqlite'),fixture],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:'inherit'}).status).toBe(0);await start()}
async function chooseSeries(id){await page.locator('.league-filters select').first().selectOption(id)}
try{
 await start();await expect(page.locator('html')).toHaveAttribute('lang','en')
 await page.evaluate(()=>window.desktop.updateSettings({language:'ko',paused:true}))
 const game=(await snapshot()).game;game.owned=Array.from({length:1025},(_,i)=>i+1).filter(id=>id!==74&&id!==95);game.appearances.ownedShiny=[10109];game.candyTokens=12_345_678
 Object.assign(game.pets[0],{family:1,phase:3,path:[4,5,6],xp:0,obtainedAt:new Date().toISOString(),evolutionTarget:null,mega:10034});game.displayPhase=3;game.appearances.owned=[10034];game.appearances.megaStones=['charizardite-x'];game.appearances.freeMegaStoneUsed=true
 await seed(game);await nav('league');await chooseSeries('rgb')
 const boulder=page.locator('[data-league="rgb-boulder"]');await expect(boulder.locator('button').last()).toBeDisabled();await expect(boulder).toContainText('1 / 2종 등록')
 await boulder.locator('summary').click();await expect(boulder.locator('.party-pokemon>.registered')).toHaveCount(1)
 checks.push('an old save gets retroactive honors; regional shiny Geodude counts by species and missing Onix keeps the badge locked')
 game.owned.push(95);await seed(game);expect(Object.keys((await snapshot()).league.unlocked)).toHaveLength(221)
 await nav('league');await chooseSeries('rgb')
 const badges=catalog.goals.filter(g=>g.kind==='badge'&&g.series==='rgb').map(g=>g.id)
 for(const id of badges){await page.locator(`[data-league="${id}"]`).getByRole('button',{name:'메인에 전시',exact:true}).click();await expect.poll(async()=>(await snapshot()).league.badges.includes(id)).toBe(true)}
 await chooseSeries('yellow');await page.locator('[data-league="yellow-boulder"]').getByRole('button',{name:'메인에 전시',exact:true}).click();await expect(page.locator('.league-message')).toContainText('최대 8개');expect((await snapshot()).league.badges).toHaveLength(8)
 checks.push('all 221 honors unlock from existing species; eight badges can be equipped and a ninth is rejected without altering saved selections')
 await page.getByRole('button',{name:'1번째 배지 오른쪽으로',exact:true}).click();const reordered=[badges[1],badges[0],...badges.slice(2)];await expect.poll(async()=>(await snapshot()).league.badges).toEqual(reordered)
 await page.locator('.honor-title-select select').selectOption('rgb-champion');await expect.poll(async()=>(await snapshot()).league.title).toBe('rgb-champion')
 await page.locator('.honor-slot').last().dragTo(page.locator('.honor-slot').first());const dragged=[reordered[7],...reordered.slice(0,7)];await expect.poll(async()=>(await snapshot()).league.badges).toEqual(dragged)
 await chooseSeries('all');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`artifacts/league-collection-${scale}.png`})
 await page.locator('.honor-title-select select').selectOption('bdsp-champion');await expect.poll(async()=>(await snapshot()).league.title).toBe('bdsp-champion')
 checks.push('arrow and real drag-and-drop reorder persist; one league title can be selected independently of badges')
 for(const language of ['en','ja','ko'])for(const theme of ['light','dark']){
  await page.evaluate(({language,theme})=>window.desktop.updateSettings({language,theme}),{language,theme})
  await application.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=dashboard')).setSize(850,680)})
  await nav('home');await page.evaluate(()=>document.fonts.ready);await expect(page.locator('.home-badges [data-honor]')).toHaveCount(8)
  const layout=await page.evaluate(()=>{const r=document.querySelector('.home-honors').getBoundingClientRect(),h=document.querySelector('.topbar').getBoundingClientRect(),controls=document.querySelector('.topbar-actions').getBoundingClientRect();return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,honors:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},header:{left:h.left,right:h.right,top:h.top,bottom:h.bottom},controlsLeft:controls.left}})
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);expect(layout.scrollHeight).toBe(layout.height);expect(layout.honors.right).toBeLessThanOrEqual(layout.controlsLeft);expect(layout.honors.bottom).toBeLessThanOrEqual(layout.header.bottom);layouts.push({language,theme,...layout})
  await page.screenshot({path:`artifacts/league-home-${language}-${theme}-${scale}.png`})
  await nav('league');await page.locator('.league-filters input').fill('꼬마돌');expect(await page.locator('.league-card').count()).toBeGreaterThan(0)
  if(language!=='ko')expect(await page.locator('.league-page').innerText()).not.toMatch(/[가-힣]/)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 }
 checks.push('three languages and both themes render at minimum window size, eight badges and a title fit without home scrolling, and cross-language Pokémon search works')
 await page.locator('.league-filters input').fill('');await chooseSeries('bdsp');await page.locator('.league-filters .segmented button').last().click();await page.locator('.league-requirements summary').click();await expect(page.locator('.league-party')).toHaveCount(5)
 await page.screenshot({path:`artifacts/league-parties-${scale}.png`})
 await nav('settings');await page.getByRole('button',{name:'업데이트 확인',exact:true}).click();await expect(page.locator('.update-settings [role="status"]')).toContainText('새 버전');await expect(page.locator('.update-settings')).toContainText('9.9.9')
 const update=await page.evaluate(()=>window.desktop.getUpdateState());expect(update.status).toBe('available');expect(update.mode).toBe('download');await expect(page.getByRole('button',{name:'새 버전 다운로드 ↗',exact:true})).toBeVisible()
 const before=await snapshot();await application.close();application=null;await start();const after=await snapshot()
 expect(after.league).toEqual(before.league);expect(after.game.candyTokens).toBe(game.candyTokens);expect(after.game.tokensEarned).toBe(game.tokensEarned);expect(after.settings.language).toBe('ko')
 checks.push('required trainer teams and official species names are inspectable; the GitHub fixture exposes a newer OS build without installing; restart preserves display, unlock dates, candy, XP and language')
 await page.evaluate(()=>window.desktop.setLeagueDisplay({badges:[],title:null}));await nav('home');expect((await snapshot()).league.badges).toEqual([]);expect(Object.keys((await snapshot()).league.unlocked)).toHaveLength(221)
 checks.push('clearing the home display preserves all permanently earned badges and titles')
 await application.close();application=null;await start()
 await application.evaluate(({app,net})=>{delete process.env.POKETOKEN_UPDATE_FIXTURE;net.fetch=()=>new Promise(resolve=>app.once('before-quit',()=>resolve({status:404,ok:false})))})
 await page.evaluate(()=>{void window.desktop.updateAction('check').catch(()=>{})});await expect.poll(()=>page.evaluate(()=>window.desktop.getUpdateState()).then(s=>s.status)).toBe('checking')
 await application.close();application=null
 checks.push('closing during a pending update check drops late network results after tray destruction without errors or interrupted shutdown')
 expect(errors).toEqual([]);const report={version:JSON.parse(readFileSync('package.json','utf8')).version,directory,scale,checks,errors,layouts};writeFileSync(`artifacts/league-report-${scale}.json`,JSON.stringify(report,null,2));writeFileSync('artifacts/league-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({scale,checks,errors},null,2))
}catch(error){await page?.screenshot({path:`artifacts/league-failure-${scale}.png`,fullPage:true}).catch(()=>{});writeFileSync(`artifacts/league-failure-${scale}.json`,JSON.stringify({directory,error:String(error),checks,errors},null,2));throw error}
finally{if(application)await application.close()}
