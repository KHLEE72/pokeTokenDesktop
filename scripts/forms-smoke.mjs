import { _electron as electronApp, expect } from './test-electron.mjs'
import electron from 'electron'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const directory=mkdtempSync(join(tmpdir(),'poketoken-forms-ui-')),data=join(directory,'data'),logs=join(directory,'logs')
mkdirSync(logs);mkdirSync('artifacts',{recursive:true})
const env={...process.env,POKETOKEN_DATA_DIR:data,POKETOKEN_TEST_MODE:'1'};delete env.ELECTRON_RUN_AS_NODE
const scale=process.env.POKETOKEN_TEST_SCALE||'native',checks=[],errors=[],layouts=[]
const forms=JSON.parse(readFileSync('src/shared/form-catalog.json','utf8')),catalog=JSON.parse(readFileSync('src/shared/localized-catalog.json','utf8'))
let application,page,pet
const snapshot=()=>page.evaluate(()=>window.desktop.getSnapshot())
const nav=async n=>{await page.locator(`.sidebar nav button[data-tab="${['home','dex','achievements','settings'][n]}"]`).click();await page.evaluate(()=>window.scrollTo(0,0))}
const showForms=async()=>{await nav(1);await page.locator('#dex-forms-tab').click()}
async function start(){
  application=await electronApp.launch({executablePath:process.env.POKETOKEN_EXE||electron,args:[...(process.env.POKETOKEN_EXE?[]:['.']),...(scale==='native'?[]:[`--force-device-scale-factor=${scale}`])],env,timeout:60000})
  await application.firstWindow();await expect.poll(()=>application.windows().some(w=>w.url().includes('view=pet'))).toBe(true)
  page=application.windows().find(w=>w.url().includes('view=dashboard'));pet=application.windows().find(w=>w.url().includes('view=pet'))
  for(const p of [page,pet])p.on('pageerror',e=>errors.push(e.message))
  await expect.poll(async()=>Boolean((await snapshot()).lastScan)).toBe(true)
  await page.evaluate(async()=>{await document.fonts.ready;await window.desktop.updateSettings({paused:true})})
}
async function widthFits(){
  const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,controls:[...document.querySelectorAll('.home-grid button,.home-grid select,.home-grid input')].map(el=>{const r=el.getBoundingClientRect(),card=el.closest('.companion-card,.candy-box,.stat-card').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,cardBottom:card.bottom}})}))
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);expect(layout.scrollHeight).toBe(layout.height)
  expect(layout.controls.every(r=>r.left>=0&&r.right<=layout.width&&r.top>=0&&r.bottom<=layout.height),JSON.stringify(layout)).toBe(true)
  expect(layout.controls.every(r=>r.bottom<=r.cardBottom),JSON.stringify(layout)).toBe(true)
  return layout
}
const search=()=>page.locator('.form-filters input')
const card=id=>page.locator(`.form-card[data-form="${id}"]`)
try{
  await start()
  await page.evaluate(path=>window.desktop.updateSettings({roots:{claude:[path],codex:[]}}),logs)
  const game=(await snapshot()).game,now=new Date().toISOString(),vulpix=forms.forms.find(f=>f.id===10103)
  const make=(id,family,phase,path,shiny=false,xp=0)=>({id,family,phase,path,shiny,xp,eggType:'fire',obtainedAt:now,evolutionTarget:null,ball:'poke'})
  game.pets=[make('pet:1',1,3,[4,5,6]),make('pet:2',1,3,[4,5,6],true),make('pet:3',0,3,[1,2,3]),make('pet:4',vulpix.family,1,[10103],false,49_900_000)]
  for(const [index,eggType]of ['grass','water','fire'].entries())game.pets.push({id:`pet:${index+5}`,family:null,phase:0,path:[],shiny:false,xp:index*100_000,eggType,obtainedAt:null,evolutionTarget:null})
  Object.assign(game,{activeId:'pet:1',displayPhase:3,nextId:8,owned:[4,5,6,1,2,3],ownedShiny:[4,5,6],candyTokens:5_100_000,tokensEarned:0,captures:[],appearances:{owned:[10103],ownedShiny:[],megaStones:[],freeMegaStoneUsed:false}})
  await application.close();application=null
  const fixture=join(directory,'fixture.json');writeFileSync(fixture,JSON.stringify(game))
  expect(spawnSync(electron,['scripts/collection-fixture.cjs',join(data,'poketoken.sqlite'),fixture],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:'inherit'}).status).toBe(0)
  await start();await showForms();await search().fill('Charizard')
  await expect(page.locator('.form-card')).toHaveCount(2)
  await expect(card(10034).getByRole('button',{name:'첫 1개 무료 선택'})).toBeEnabled()
  await card(10034).getByRole('button',{name:'첫 1개 무료 선택'}).click()
  await expect.poll(async()=>(await snapshot()).game.appearances.megaStones).toEqual(['charizardite-x'])
  expect((await snapshot()).game.candyTokens).toBe(5_100_000)
  await card(10035).getByRole('button',{name:'사탕 50개로 영구 해금'}).click()
  await expect.poll(async()=>(await snapshot()).game.candyTokens).toBe(100_000)
  await expect(card(10034).getByRole('button',{name:'함께하기',exact:true})).toBeEnabled()
  await expect.poll(()=>page.locator('.form-card img').evaluateAll(imgs=>imgs.length===2&&imgs.every(img=>img.complete&&img.naturalWidth>0))).toBe(true)
  await page.screenshot({path:`artifacts/forms-shop-${scale}.png`})
  checks.push('first Charizard stone is free, second costs exactly 50 candies, X/Y are separate permanent unlocks and purchased buttons disappear')

  await card(10034).getByRole('button',{name:'함께하기',exact:true}).click()
  await expect.poll(async()=>(await snapshot()).game.pets.find(p=>p.id==='pet:1').mega).toBe(10034)
  await expect(pet.locator('.pet-character img')).toHaveAttribute('alt',forms.forms.find(f=>f.id===10034).names.ko,{timeout:30000})
  await nav(0);await expect(page.locator('.companion-description h2')).toHaveText('메가리자몽X')
  await page.locator('.mega-picker select').selectOption('')
  await expect(page.locator('.companion-description h2')).toHaveText('리자몽')
  await page.locator('.mega-picker select').selectOption('10035')
  await expect(page.locator('.companion-description h2')).toHaveText('메가리자몽Y')
  await showForms();await search().fill('Charizard');await page.locator('.form-filters button[aria-pressed]').click()
  await card(10034).getByRole('button',{name:'함께하기',exact:true}).click()
  await expect.poll(async()=>(await snapshot()).game.activeId).toBe('pet:2')
  await expect(pet.locator('.pet-character img')).toHaveAttribute('alt','메가리자몽X')
  expect((await snapshot()).game.candyTokens).toBe(100_000)
  expect((await snapshot()).game.appearances.ownedShiny).toContain(10034)
  checks.push('actual normal/shiny Mega sprites render; form switching keeps the original growth and shares stones across individuals without additional payment')

  for(const language of ['en','ja','ko']){
    await page.evaluate(language=>window.desktop.updateSettings({language}),language)
    await expect(page.locator('html')).toHaveAttribute('lang',language)
    await nav(0)
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=dashboard')).setSize(850,680))
    await expect(page.locator('.companion-description h2')).toHaveText((language==='ko'?'✦ 이로치 ':language==='en'?'✦ Shiny ':'✦ 色違い ')+forms.forms.find(f=>f.id===10034).names[language])
    layouts.push({language,...await widthFits()})
    await page.screenshot({path:`artifacts/forms-home-${language}-${scale}.png`})
    await showForms();await search().fill('Charizard')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
    if(language!=='ko')expect(await page.locator('.forms-page').innerText()).not.toMatch(/[가-힣]/)
    await search().fill('Floette')
    await expect(card(10296).locator('.stone-name')).toContainText(forms.forms.find(f=>f.id===10061).names[language])
    const aliases={en:'Alolan Vulpix',ja:'ロコン',ko:'식스테일'}
    await search().fill(aliases[language]);expect(await page.locator('.form-card').count()).toBeGreaterThan(0)
  }
  checks.push('three languages use localized form and stone names, cross-language search works, and minimum-size Mega home has no scrolling or clipped controls')

  await showForms();await search().fill('Alolan Vulpix')
  await card(10103).getByRole('button',{name:'함께하기',exact:true}).click()
  await expect.poll(async()=>(await snapshot()).game.activeId).toBe('pet:4')
  await nav(0)
  appendFileSync(join(logs,'usage.jsonl'),JSON.stringify({type:'assistant',timestamp:new Date(Date.now()+1000).toISOString(),requestId:'regional-forms-smoke',message:{id:'regional-evolution',usage:{input_tokens:100_000}}})+'\n')
  await page.evaluate(()=>window.desktop.refresh())
  await expect.poll(async()=>(await snapshot()).game.pets.find(p=>p.id==='pet:4').path).toEqual([10103,10104])
  await expect(page.locator('.companion-description h2')).toHaveText(forms.forms.find(f=>f.id===10104).names.ko)
  await expect(pet.locator('.pet-character img')).toHaveAttribute('alt',forms.forms.find(f=>f.id===10104).names.ko,{timeout:30000})
  const evolved=(await snapshot()).game
  expect(evolved.owned).not.toContain(38);expect(evolved.appearances.owned).toContain(10104)
  expect(evolved.captures.at(-1).speciesId).toBe(10104);expect(evolved.tokensEarned).toBe(100_000)
  await widthFits()
  checks.push('new usage through the real scanner evolves Alolan Vulpix into Alolan Ninetales, registers the regional form separately and records its real completion')

  for(const id of [10161,10229,10238,10253,10247,10061,10278,10301]){
    await showForms();await search().fill(forms.forms.find(f=>f.id===id).names.en)
    await expect(card(id).locator('img')).toBeVisible({timeout:30000})
    await expect.poll(()=>card(id).locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true)
  }
  await search().fill('Mega Zygarde')
  await expect(card(10301).locator('[data-artwork="true"] img')).toBeVisible()
  await page.locator('.form-filters button[aria-pressed]').click()
  await expect(card(10301).locator('img')).toBeVisible({timeout:30000})
  checks.push('representative Alola/Galar/Hisui/Paldea, prerequisite and Z-A forms download; Mega Zygarde uses separate normal/shiny artwork sources')

  const saved=(await snapshot()).game
  await application.close();application=null;await start()
  expect((await snapshot()).game).toEqual(saved)
  await showForms();await search().fill('Charizard')
  await expect(card(10034).getByRole('button',{name:'첫 1개 무료 선택'})).toHaveCount(0)
  await expect(card(10035).getByRole('button',{name:'사탕 50개로 영구 해금'})).toHaveCount(0)
  await nav(0);expect((await snapshot()).game.tokensEarned).toBe(100_000)
  checks.push('restart preserves the one-time free choice, both purchased stones, normal/shiny form records, regional evolution, candy balance and usage baseline')
  expect(errors).toEqual([])
  const report=JSON.stringify({directory,scale,checks,errors,layouts},null,2)
  writeFileSync(`artifacts/forms-report-${scale}.json`,report)
  writeFileSync('artifacts/forms-report.json',report)
  console.log(JSON.stringify({scale,checks,errors},null,2))
}catch(error){
  await page?.screenshot({path:`artifacts/forms-failure-${scale}.png`,fullPage:true}).catch(()=>{})
  writeFileSync(`artifacts/forms-failure-${scale}.json`,JSON.stringify({directory,error:String(error),checks,errors},null,2));throw error
}finally{if(application)await application.close()}
