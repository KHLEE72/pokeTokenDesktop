import {_electron as electronApp,expect} from '@playwright/test'
import electron from 'electron'
import {spawnSync} from 'node:child_process'
import {mkdirSync,mkdtempSync,writeFileSync,appendFileSync,existsSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const directory=mkdtempSync(join(tmpdir(),'poketoken-collection-')),data=join(directory,'data'),logs=join(directory,'logs')
mkdirSync(logs);mkdirSync('artifacts',{recursive:true})
const file=join(logs,'usage.jsonl'),env={...process.env,POKETOKEN_DATA_DIR:data,POKETOKEN_TEST_MODE:'1'};delete env.ELECTRON_RUN_AS_NODE
const checks=[],errors=[],executablePath=process.env.POKETOKEN_EXE||electron
let application,page,pet,sequence=0
const row=tokens=>JSON.stringify({type:'assistant',timestamp:new Date(Date.now()+1000).toISOString(),requestId:'collection',message:{id:`turn-${sequence++}`,usage:{input_tokens:tokens}}})+'\n'
const state=()=>page.evaluate(()=>window.desktop.getSnapshot())
const selected=s=>s.game.pets.find(p=>p.id===s.game.activeId)
async function start(){application=await electronApp.launch({executablePath,args:process.env.POKETOKEN_EXE?[]:['.'],env,timeout:60000});await application.firstWindow();await expect.poll(()=>application.windows().some(p=>p.url().includes('view=pet'))).toBe(true);page=application.windows().find(p=>p.url().includes('view=dashboard'));pet=application.windows().find(p=>p.url().includes('view=pet'));page.on('pageerror',e=>errors.push(e.message));await expect.poll(async()=>Boolean((await state()).lastScan)).toBe(true)}
async function tokens(n){appendFileSync(file,row(n));await page.evaluate(()=>window.desktop.refresh())}
async function openEggs(){if(!await page.locator('.egg-drawer').evaluate(el=>el.open))await page.locator('.egg-drawer > summary').click()}
async function home(){await page.getByRole('button',{name:'현재 펫 · 사용량',exact:false}).first().click();await openEggs()}
async function dex(shiny){await page.getByRole('button',{name:'나의 도감',exact:false}).first().click();await page.getByRole('button',{name:shiny?'✦ 이로치 도감':'일반 도감',exact:true}).click()}
async function choose(name,shiny){await dex(shiny);await page.getByRole('searchbox',{name:'포켓몬 이름 또는 도감 번호 검색'}).fill(name);const button=page.getByRole('button',{name:`${shiny?'이로치 ':''}${name} 선택`,exact:true});await button.click();await expect(button).toHaveText('함께하는 중')}
try{
  writeFileSync(file,row(1_000_000));await start();await page.evaluate(path=>window.desktop.updateSettings({roots:{claude:[path],codex:[]},paused:true}),logs)
  expect((await state()).game.tokensEarned).toBe(0)
  await tokens(250_000);const grass=selected(await state()).id
  await openEggs()
  await expect(page.locator('.egg-preview')).toContainText('풀 알50.0%부화 중')
  await expect(page.getByRole('button',{name:/알 선택$/})).toHaveCount(18)
  await page.getByRole('button',{name:'불꽃 알 선택',exact:true}).click()
  expect((await state()).game.pets.find(p=>p.id===grass).xp).toBe(250_000)
  await expect(page.locator('.egg-preview')).toContainText('풀 알50.0%보관 중')
  await expect(page.locator('[data-egg-type="grass"] .egg-growth')).toContainText('50.0%')
  await expect(page.locator('[data-egg-type="fire"] .egg-growth')).toContainText('0.0%')
  await expect(page.getByRole('button',{name:'사탕 먹이기',exact:true})).toBeDisabled()
  await tokens(500_000);const fire=selected(await state())
  await expect(page.locator('.egg-preview')).not.toContainText('불꽃 알')
  await tokens(150_300_001);let snapshot=await state()
  expect(selected(snapshot).phase).toBe(3);expect(snapshot.game.candyTokens).toBe(300_001)
  expect(snapshot.game.activeId).toBe(fire.id)
  checks.push('18 typed eggs render; saved egg progress survives switching; eggs reject candies; final evolution holds the pet and banks overflow')
  await page.getByRole('button',{name:'풀 알 선택',exact:true}).click();await tokens(250_010)
  const growing=selected(await state())
  await page.getByRole('button',{name:'사탕 먹이기',exact:true}).click()
  await expect.poll(async()=>selected(await state()).xp).toBe(100_010)
  await tokens(90);expect(selected(await state()).xp).toBe(100_100)
  await choose('리자몽',fire.shiny)
  await tokens(50_000);expect((await state()).game.candyTokens).toBe(250_001)
  writeFileSync(join(logs,'pending-session.jsonl'),row(50_000))
  await choose('이상해씨',growing.shiny)
  snapshot=await state();expect(selected(snapshot).xp).toBe(100_100);expect(snapshot.game.candyTokens).toBe(300_001)
  checks.push('candies supplement automatic token growth; selection restores individual progress and pending tokens are credited to the previous pet')
  await choose('파이리',fire.shiny);await tokens(100_000)
  snapshot=await state();expect(snapshot.game.displayPhase).toBe(1);expect(selected(snapshot).phase).toBe(3);expect(snapshot.game.candyTokens).toBe(400_001)
  await expect(page.getByRole('button',{name:'사탕 먹이기',exact:true})).toHaveCount(0)
  await home()
  await expect(page.getByRole('button',{name:'사탕 먹이기',exact:true})).toBeDisabled()
  checks.push('an earlier appearance of a completed individual stays complete and earns candy instead of restarting evolution')
  await home();await page.getByRole('button',{name:'불꽃 알 선택',exact:true}).click();await tokens(500_000)
  snapshot=await state();expect(snapshot.game.activeId).not.toBe(fire.id)
  const saved=structuredClone(snapshot.game)
  let rejected=false;try{await page.evaluate(()=>window.desktop.gameAction({type:'candy',count:999999}))}catch{rejected=true}
  expect(rejected).toBe(true);expect((await state()).game).toEqual(saved)
  await application.close();application=null;await start();expect((await state()).game).toEqual(saved)
  checks.push('new eggs create distinct individuals; invalid candy spending is atomic; selection, candy remainder and all growth survive restart')
  await application.close();application=null
  const fixture=structuredClone(saved),id=`pet:${fixture.nextId++}`
  fixture.pets.push({id,family:13,phase:1,xp:49_999_999,shiny:true,eggType:'ghost',obtainedAt:new Date().toISOString()})
  if(!fixture.ownedShiny.includes(92))fixture.ownedShiny.push(92)
  const json=join(directory,'shiny.json');writeFileSync(json,JSON.stringify(fixture))
  const seeded=spawnSync(electron,['scripts/collection-fixture.cjs',join(data,'poketoken.sqlite'),json],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},stdio:'inherit',windowsHide:true})
  expect(seeded.status).toBe(0);await start();await choose('고오스',true)
  await expect(pet.locator('.pet-character img')).toHaveAttribute('alt','고오스')
  await expect(pet.locator('.pet-motion .sprite')).toHaveAttribute('data-shiny','true')
  await expect.poll(()=>existsSync(join(data,'sprites','92-shiny.gif')),{timeout:30000}).toBe(true)
  const normal=await page.evaluate(()=>window.desktop.getSprite(92,false)),shiny=await page.evaluate(()=>window.desktop.getSprite(92,true))
  expect(normal).not.toBeNull();expect(shiny).not.toBeNull();expect(normal).not.toBe(shiny)
  expect(readFileSync(join(data,'sprites','92-shiny.gif')).subarray(0,3).toString()).toBe('GIF')
  await page.screenshot({path:'artifacts/collection-shiny-dex.png'})
  await pet.screenshot({path:'artifacts/collection-shiny-pet.png',omitBackground:true})
  await dex(false);await expect(page.getByRole('button',{name:'고오스 선택',exact:true})).toBeDisabled()
  await dex(true);await expect(page.getByRole('button',{name:'사탕 먹이기',exact:true})).toHaveCount(0);await home();await page.getByRole('button',{name:'사탕 먹이기',exact:true}).click()
  await expect(pet.locator('.pet-character img')).toHaveAttribute('alt','고우스트')
  await expect(pet.locator('.pet-bubble')).toHaveAttribute('data-dialogue','growth')
  snapshot=await state();expect(selected(snapshot).phase).toBe(2);expect(selected(snapshot).xp).toBe(99_999)
  expect(selected(snapshot).shiny).toBe(true);expect(snapshot.game.ownedShiny).toContain(93)
  checks.push('candy-triggered evolution preserves shiny color, carries experience and emits the growth reaction')
  await home();await page.screenshot({path:'artifacts/collection-home.png',fullPage:true})
  checks.push('shiny unlocks are independent; shiny dex selection changes the real desktop sprite; normal and shiny caches stay separate')
  expect(errors).toEqual([])
  writeFileSync('artifacts/collection-report.json',JSON.stringify({checks,errors,executablePath},null,2));console.log(JSON.stringify({checks,errors},null,2))
}finally{if(application)await application.close()}
