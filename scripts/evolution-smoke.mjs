import {_electron as electronApp,expect} from '@playwright/test'
import electron from 'electron'
import {spawnSync} from 'node:child_process'
import {appendFileSync,mkdirSync,mkdtempSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const directory=mkdtempSync(join(tmpdir(),'poketoken-evolution-')),data=join(directory,'data'),logs=join(directory,'logs')
mkdirSync(logs);mkdirSync('artifacts',{recursive:true})
const file=join(logs,'usage.jsonl'),env={...process.env,POKETOKEN_DATA_DIR:data,POKETOKEN_TEST_MODE:'1'};delete env.ELECTRON_RUN_AS_NODE
let application,page,pet,sequence=0
const checks=[],errors=[],leaves=['134','135','136','196','197','470','471','700']
const row=tokens=>JSON.stringify({type:'assistant',timestamp:new Date(Date.now()+1000).toISOString(),requestId:'eevee',message:{id:`turn-${sequence++}`,usage:{input_tokens:tokens}}})+'\n'
const state=()=>page.evaluate(()=>window.desktop.getSnapshot())
const selected=s=>s.game.pets.find(p=>p.id===s.game.activeId)
async function start(){
  application=await electronApp.launch({executablePath:process.env.POKETOKEN_EXE||electron,args:process.env.POKETOKEN_EXE?[]:['.'],env,timeout:60000})
  await application.firstWindow();await expect.poll(()=>application.windows().some(p=>p.url().includes('view=pet'))).toBe(true)
  page=application.windows().find(p=>p.url().includes('view=dashboard'));pet=application.windows().find(p=>p.url().includes('view=pet'))
  for(const p of [page,pet])p.on('pageerror',e=>errors.push(e.message))
  await expect.poll(async()=>Boolean((await state()).lastScan)).toBe(true)
  const width=await application.evaluate(({BrowserWindow})=>{
    const dashboard=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=dashboard'))
    dashboard.setSize(850,680);return dashboard.getContentBounds().width
  })
  await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(width)
  await page.evaluate(async()=>{await document.fonts.ready})
}
async function seed(game){
  await application.close();application=null
  const json=join(directory,'fixture.json');writeFileSync(json,JSON.stringify(game))
  const result=spawnSync(electron,['scripts/collection-fixture.cjs',join(data,'poketoken.sqlite'),json],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},stdio:'inherit',windowsHide:true})
  expect(result.status).toBe(0);await start()
}
async function tokens(n){appendFileSync(file,row(n));await page.evaluate(()=>window.desktop.refresh())}
async function home(){await page.getByRole('button',{name:'현재 펫 · 사용량',exact:false}).first().click()}
async function dex(shiny,name){
  await page.getByRole('button',{name:'나의 도감',exact:false}).first().click()
  await page.getByRole('button',{name:shiny?'✦ 이로치 도감':'일반 도감',exact:true}).click()
  await page.getByRole('searchbox',{name:'포켓몬 이름 또는 도감 번호 검색'}).fill(name)
}
async function fits(){
  const bounds=await page.evaluate(()=>{
    const cards=[...document.querySelectorAll('.companion-card,.today-card,.candy-box')]
    return {height:innerHeight,scrollHeight:document.documentElement.scrollHeight,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,inside:cards.every(card=>[...card.querySelectorAll('button,input,select,.progress-track')].every(el=>{const r=el.getBoundingClientRect(),c=card.getBoundingClientRect();return r.left>=c.left && r.right<=c.right && r.top>=c.top && r.bottom<=c.bottom}))}
  })
  expect(bounds.scrollHeight).toBe(bounds.height);expect(bounds.scrollWidth).toBe(bounds.width);expect(bounds.inside).toBe(true)
}
try{
  writeFileSync(file,row(1_000_000));await start()
  await page.evaluate(path=>window.desktop.updateSettings({roots:{claude:[path],codex:[]},paused:true,theme:'dark'}),logs)
  const game=(await state()).game,now=new Date().toISOString()
  game.pets=[{id:'pet:1',family:18,phase:1,xp:49_800_000,shiny:true,eggType:'normal',obtainedAt:now,path:[133],evolutionTarget:null}]
  Object.assign(game,{activeId:'pet:1',displayPhase:1,nextId:2,candyTokens:300_000,tokensEarned:50_300_000,owned:[],ownedShiny:[133],captures:[]})
  await seed(game)
  await expect(pet.locator('.pet-character img')).toHaveAttribute('alt','이브이',{timeout:30000})
  const target=()=>page.getByRole('combobox',{name:'진화 목표',exact:true})
  expect(await target().locator('option').evaluateAll(options=>options.map(o=>o.value).filter(Boolean))).toEqual(leaves)
  for(const id of ['134','197'])await target().selectOption(id)
  await expect.poll(async()=>selected(await state()).evolutionTarget).toBe(197)
  const planned=(await state()).game
  await application.close();application=null;await start()
  expect((await state()).game).toEqual(planned);await expect(target()).toHaveValue('197')
  await target().selectOption('')
  expect(selected(await state()).xp).toBe(49_800_000);expect((await state()).game.ownedShiny).toEqual([133])
  await fits();await page.screenshot({path:'artifacts/eevee-growing-dark.png'})
  checks.push('all eight evolution goals are selectable before evolution; changing and clearing a goal preserve progress and do not unlock unchosen species; the minimum-size home still fits')
  await tokens(300_001);await tokens(99_999)
  let snapshot=await state()
  expect(selected(snapshot).path).toEqual([133]);expect(selected(snapshot).xp).toBe(50_000_000)
  expect(snapshot.game.candyTokens).toBe(500_000);expect(snapshot.game.captures).toEqual([])
  await expect(page.getByRole('progressbar',{name:'현재 펫 성장 진행률'})).toHaveAttribute('aria-valuenow','100')
  await expect(page.getByRole('button',{name:'사탕 먹이기',exact:true})).toBeDisabled()
  await fits();await page.screenshot({path:'artifacts/eevee-waiting-dark.png'})
  await application.close();application=null;await start()
  expect((await state()).game).toEqual(snapshot.game)
  await page.evaluate(()=>window.desktop.refresh());expect((await state()).game).toEqual(snapshot.game)
  await expect(pet.locator('.pet-bubble small')).toHaveText('진화 목표 선택 대기')
  for(const size of [96,128]) {
    await pet.evaluate(size=>window.desktop.updateSettings({size}),size)
    await expect.poll(()=>pet.locator('.pet-character').evaluate(el=>el.getBoundingClientRect().width)).toBe(size)
    await pet.evaluate(async()=>{await document.fonts.ready})
    const speech=await pet.evaluate(()=>({text:document.querySelector('.pet-bubble small').getBoundingClientRect().bottom,character:document.querySelector('.pet-character').getBoundingClientRect().top}))
    expect(speech.text).toBeLessThanOrEqual(speech.character)
  }
  checks.push('real log usage stops Eevee at 100% without a goal, banks overflow and subsequent usage once, disables candy, and preserves the waiting state on restart/rescan')
  checks.push('the waiting summary stays compact and above the character at 96px and 128px instead of overlapping the pet')
  await target().selectOption('700')
  await expect(page.locator('.companion-description h2')).toHaveText('✦ 이로치 님피아')
  await expect(pet.locator('.pet-character img')).toHaveAttribute('alt','님피아',{timeout:30000})
  snapshot=await state();expect(selected(snapshot).path).toEqual([133,700])
  expect(snapshot.game.ownedShiny).toEqual([133,700]);expect(snapshot.game.captures[0].speciesId).toBe(700)
  expect(snapshot.game.candyTokens).toBe(500_000)
  await page.screenshot({path:'artifacts/eevee-evolved-dark.png'})
  checks.push('choosing a goal at 100% immediately evolves the same shiny individual, keeps the candy bank, updates the desktop sprite, and records the actual final species')
  await dex(true,'블래키');await expect(page.getByRole('button',{name:'이로치 블래키 선택',exact:true})).toBeDisabled()
  await dex(false,'님피아');await expect(page.getByRole('button',{name:'님피아 선택',exact:true})).toBeDisabled()
  await dex(true,'님피아');await expect(page.getByRole('button',{name:'이로치 님피아 선택',exact:true})).toHaveText('함께하는 중')
  await expect(page.locator('.history')).toContainText('✦ 이로치 님피아')
  await page.screenshot({path:'artifacts/eevee-shiny-dex.png'})
  await dex(true,'이브이');await page.getByRole('button',{name:'이로치 이브이 선택',exact:true}).click();await home()
  await expect(target()).toHaveCount(0);await expect(page.getByRole('button',{name:'사탕 먹이기',exact:true})).toBeDisabled()
  await tokens(100_000);snapshot=await state();expect(snapshot.game.candyTokens).toBe(600_000)
  expect(selected(snapshot).path).toEqual([133,700]);expect(snapshot.game.displayPhase).toBe(1)
  await expect(page.evaluate(()=>window.desktop.gameAction({type:'target',speciesId:134}))).rejects.toThrow('선택')
  expect((await state()).game).toEqual(snapshot.game)
  checks.push('only the chosen shiny branch is unlocked; earlier Eevee stays completed and banks tokens; changing its finished branch is rejected without altering state')
  const second=structuredClone(snapshot.game),secondId=`pet:${second.nextId++}`
  second.pets.push({id:secondId,family:18,phase:1,xp:49_950_000,shiny:false,eggType:'normal',obtainedAt:now,path:[133],evolutionTarget:134})
  second.owned.push(133);second.activeId=secondId;second.displayPhase=1
  await seed(second);await page.getByRole('button',{name:'사탕 먹이기',exact:true}).click()
  await expect.poll(async()=>selected(await state()).path).toEqual([133,134])
  snapshot=await state();expect(selected(snapshot).path).toEqual([133,134]);expect(snapshot.game.candyTokens).toBe(550_000)
  expect(snapshot.game.owned).toEqual([133,134]);expect(snapshot.game.ownedShiny).toEqual([133,700])
  expect(snapshot.game.captures.map(c=>c.speciesId)).toEqual([700,134])
  await expect(pet.locator('.pet-character img')).toHaveAttribute('alt','샤미드',{timeout:30000})
  await application.close();application=null;await start();expect((await state()).game).toEqual(snapshot.game)
  checks.push('a second normal Eevee follows its saved goal using candy, preserves unused candy value and the first branch, and retains both paths/capture identities after restart')
  const sprites=await page.evaluate(async()=>Promise.all([133,134,135,136,196,197,470,471,700].flatMap(id=>[false,true].map(shiny=>window.desktop.getSprite(id,shiny)))))
  expect(sprites.every(s=>s?.startsWith('data:image/gif;base64,'))).toBe(true)
  checks.push('all nine normal and shiny GIF sprites download and cache through the packaged sprite API')
  await page.locator('.egg-drawer > summary').click()
  await expect(page.locator('.egg-choice[data-egg-type="normal"]')).toContainText('이브이')
  expect(errors).toEqual([])
  writeFileSync('artifacts/evolution-report.json',JSON.stringify({checks,errors,executablePath:process.env.POKETOKEN_EXE||electron},null,2));console.log(JSON.stringify({checks,errors},null,2))
}finally{if(application)await application.close()}
