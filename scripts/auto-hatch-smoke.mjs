import {_electron as electronApp,expect} from './test-electron.mjs'
import electron from 'electron'
import {appendFileSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const directory=mkdtempSync(join(tmpdir(),'poketoken-auto-hatch-ui-')),data=join(directory,'data'),logs=join(directory,'logs'),file=join(logs,'usage.jsonl')
mkdirSync(logs);mkdirSync('artifacts',{recursive:true})
const env={...process.env,POKETOKEN_DATA_DIR:data,POKETOKEN_TEST_MODE:'1'};delete env.ELECTRON_RUN_AS_NODE
const checks=[],errors=[],layouts=[];let app,page,sequence=0
const state=()=>page.evaluate(()=>window.desktop.getSnapshot())
const active=s=>s.game.pets.find(p=>p.id===s.game.activeId)
const panel=()=>page.locator('.auto-hatch')
const type=()=>page.getByRole('combobox',{name:'자동 부화 알 선택',exact:true})
const mode=()=>page.getByRole('combobox',{name:'자동 부화 목표 방식',exact:true})
const target=()=>page.getByRole('combobox',{name:'자동 부화 타겟 포켓몬',exact:true})
const variant=()=>page.getByRole('combobox',{name:'자동 부화 모습 조건',exact:true})
function row(tokens){return JSON.stringify({type:'assistant',timestamp:new Date(Date.now()+1000).toISOString(),requestId:'auto-hatch',message:{id:`auto:${sequence++}`,usage:{input_tokens:tokens}}})+'\n'}
async function start(hidden=false){
  app=await electronApp.launch({executablePath:process.env.POKETOKEN_EXE||electron,args:[...(process.env.POKETOKEN_EXE?[]:['.']),...(hidden?['--hidden']:[])],env,timeout:60000})
  await app.firstWindow();await expect.poll(()=>app.windows().some(p=>p.url().includes('view=dashboard'))).toBe(true)
  page=app.windows().find(p=>p.url().includes('view=dashboard'));page.on('pageerror',e=>errors.push(e.message))
  await expect.poll(async()=>Boolean((await state()).lastScan)).toBe(true)
  await app.evaluate(({app})=>{globalThis.loginWrites=0;app.setLoginItemSettings=()=>{globalThis.loginWrites++;throw Error('OS login registration is forbidden in smoke tests')}})
}
async function usage(tokens){appendFileSync(file,row(tokens));await page.evaluate(()=>window.desktop.refresh())}
async function drawer(){await page.locator('.egg-drawer > summary').click()}
try{
  writeFileSync(file,row(100_000));await start()
  await page.evaluate(path=>window.desktop.updateSettings({roots:{claude:[path],codex:[]},paused:true,visible:false}),logs)
  await drawer();await type().selectOption('fairy');await mode().selectOption('target')
  expect(await target().locator('option').evaluateAll(options=>options.map(o=>o.value))).not.toContain('700')
  await type().selectOption('grass');await target().selectOption('1');await variant().selectOption('shiny')
  expect(await target().locator('option').evaluateAll(options=>options.map(o=>o.value))).not.toContain('2')
  await page.getByRole('button',{name:'자동 부화 시작',exact:true}).click();await usage(1_250_000)
  let snapshot=await state();expect(snapshot.game.autoHatch).toMatchObject({enabled:true,eggType:'grass',targetId:1,variant:'shiny',hatched:2})
  expect(active(snapshot)).toMatchObject({phase:0,xp:250_000});expect(snapshot.game.pets.filter(p=>p.phase===1)).toHaveLength(2)
  await drawer();await expect(page.locator('.egg-drawer-heading')).toContainText('자동 부화 중 · 2회')
  const saved=snapshot.game;await app.close();app=null;appendFileSync(file,row(500_000));await start();await page.evaluate(()=>window.desktop.refresh())
  snapshot=await state();expect(snapshot.game.autoHatch.hatched).toBe(3);expect(active(snapshot).xp).toBe(250_000);expect(snapshot.game.pets.slice(0,2)).toEqual(saved.pets.slice(0,2))
  await page.evaluate(()=>window.desktop.refresh());expect((await state()).game).toEqual(snapshot.game)
  checks.push('the actual scanner repeatedly hatches while a shiny target is unmet; every normal hatch is retained, overflow and collapsed status are correct, restart/offline usage are credited exactly once')
  await drawer();await expect(type()).toHaveValue('grass');await expect(variant()).toHaveValue('shiny')
  await page.getByRole('button',{name:'자동 부화 중지',exact:true}).click();await variant().selectOption('normal')
  await page.getByRole('button',{name:'자동 부화 시작',exact:true}).click();await usage(250_123)
  snapshot=await state();expect(snapshot.game.autoHatch).toMatchObject({enabled:false,hatched:1,matchedPetId:snapshot.game.activeId})
  expect(active(snapshot)).toMatchObject({phase:1,xp:123,shiny:false});await expect(panel().locator('.auto-hatch-success')).toBeVisible()
  await usage(77);expect(active(await state()).xp).toBe(200)
  checks.push('only actual hatch roots can be targeted; the chosen normal target stops the run, keeps the new companion selected, and uses remaining/new tokens for ordinary growth')
  await type().selectOption('random');await page.getByRole('button',{name:'자동 부화 시작',exact:true}).click();await usage(1_100_000)
  snapshot=await state();expect(snapshot.game.autoHatch.hatched).toBe(2);expect(snapshot.game.autoHatch.enabled).toBe(true)
  expect(active(snapshot).phase).toBe(0);await page.getByRole('button',{name:'자동 부화 중지',exact:true}).click()
  expect(active(await state()).xp).toBe(active(snapshot).xp)
  await type().selectOption('water');await mode().selectOption('random');await page.getByRole('button',{name:'자동 부화 시작',exact:true}).click();await usage(500_000)
  expect(active(await state())).toMatchObject({phase:0,eggType:'water'});expect((await state()).game.autoHatch.hatched).toBe(1)
  const preserved=active(await state());await page.evaluate(()=>window.desktop.gameAction({type:'select',petId:'pet:1',phase:1}))
  expect((await state()).game.autoHatch.enabled).toBe(false);expect((await state()).game.pets.find(p=>p.id===preserved.id)).toEqual(preserved)
  checks.push('random-type and fixed-type random hatch modes repeat, manual stop and choosing another companion keep the partial egg and all previous individuals')
  const width=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=dashboard'));w.setSize(850,680);return w.getContentBounds().width})
  await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(width)
  for(const language of ['en','ja','ko'])for(const theme of ['light','dark']){
    await page.evaluate(value=>window.desktop.updateSettings(value),{language,theme})
    await panel().locator('select').nth(0).selectOption('ice');await panel().locator('select').nth(1).selectOption('target')
    await panel().locator('input').fill('Vulpix')
    expect(await panel().locator('select').nth(2).locator('option').count()).toBeGreaterThan(1)
    const layout=await panel().evaluate(el=>({scroll:document.documentElement.scrollWidth>innerWidth,inside:[...el.querySelectorAll('button,input,select')].every(c=>{const r=c.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),text:el.textContent}))
    expect(layout.scroll).toBe(false);expect(layout.inside).toBe(true);if(language!=='ko')expect(layout.text).not.toMatch(/[가-힣]/)
    layouts.push({language,theme,...layout});await page.screenshot({path:`artifacts/auto-hatch-${language}-${theme}.png`,fullPage:true})
    await drawer();expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)).toBe(false);await drawer()
  }
  checks.push('three languages and both themes fit the minimum window; target search accepts official names across languages, regional roots are selectable and the closed home never scrolls')
  await page.getByRole('button',{name:'설정',exact:false}).first().click();await page.getByRole('switch',{name:'자동 시작',exact:true}).click()
  await expect.poll(async()=>(await state()).startup).toBe('enabled');expect(await app.evaluate(()=>globalThis.loginWrites)).toBe(0)
  const before=(await state()).game;await app.close();app=null;await start(true)
  expect((await state()).settings.autoStart).toBe(true);expect((await state()).startup).toBe('enabled');expect((await state()).game).toEqual(before)
  expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=dashboard')).isVisible())).toBe(false)
  expect(await app.evaluate(()=>globalThis.loginWrites)).toBe(0)
  checks.push('startup preference survives restart and --hidden keeps the management window hidden; isolated test mode never writes the user OS startup registration')
  expect(errors).toEqual([])
  writeFileSync('artifacts/auto-hatch-report.json',JSON.stringify({version:JSON.parse(readFileSync('package.json','utf8')).version,directory,checks,errors,layouts},null,2));console.log(JSON.stringify({checks,errors},null,2))
}catch(error){await page?.screenshot({path:'artifacts/auto-hatch-failure.png',fullPage:true}).catch(()=>{});throw error}
finally{if(app)await app.close()}
