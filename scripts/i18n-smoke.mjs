import { _electron as electronApp, expect } from '@playwright/test'
import electron from 'electron'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const directory=mkdtempSync(join(tmpdir(),'poketoken-i18n-')),data=join(directory,'data')
const env={...process.env,POKETOKEN_DATA_DIR:data,POKETOKEN_TEST_MODE:'1'};delete env.ELECTRON_RUN_AS_NODE
const checks=[],errors=[],scale=process.env.POKETOKEN_TEST_SCALE||'native'
mkdirSync('artifacts',{recursive:true})
let application,page,pet
const snapshot=()=>page.evaluate(()=>window.desktop.getSnapshot())
const nav=async index=>{await page.locator('.sidebar nav button').nth(index).click();await page.evaluate(()=>window.scrollTo(0,0))}
async function start(){
  application=await electronApp.launch({executablePath:process.env.POKETOKEN_EXE||electron,args:[...(process.env.POKETOKEN_EXE?[]:['.']),...(scale==='native'?[]:[`--force-device-scale-factor=${scale}`])],env,timeout:60000})
  await application.firstWindow();await expect.poll(()=>application.windows().some(w=>w.url().includes('view=pet'))).toBe(true)
  page=application.windows().find(w=>w.url().includes('view=dashboard'));pet=application.windows().find(w=>w.url().includes('view=pet'))
  for(const p of [page,pet])p.on('pageerror',error=>errors.push(error.message))
  await expect.poll(async()=>Boolean((await snapshot()).lastScan)).toBe(true)
  await page.evaluate(async()=>{await document.fonts.ready;await window.desktop.updateSettings({paused:true})})
}
async function noKorean(){
  const text=await page.locator('body').innerText()
  expect(text.replaceAll('한국어',''),text).not.toMatch(/[가-힣]/)
  const labels=await page.locator('[aria-label],[title],[placeholder]').evaluateAll(els=>els.flatMap(el=>['aria-label','title','placeholder'].map(key=>el.getAttribute(key)||'')))
  expect(labels.join('\n')).not.toMatch(/[가-힣]/)
}
async function fits(){
  const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,controls:[...document.querySelectorAll('.home-grid button,.home-grid input,.home-grid select')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom}})}))
  expect(layout.scrollWidth).toBe(layout.width);expect(layout.scrollHeight).toBe(layout.height)
  expect(layout.controls.every(r=>r.left>=0&&r.right<=layout.width&&r.bottom<=layout.height),JSON.stringify(layout)).toBe(true)
}
try{
  await start()
  await expect(page.locator('html')).toHaveAttribute('lang','en')
  expect((await snapshot()).settings.language).toBe('en')
  expect((await snapshot()).settings.dexSort).toBe('number')
  checks.push('fresh install starts in English with number sorting')
  await nav(1);await page.getByRole('tab').last().click()
  await expect(page.locator('.evolution-history-empty')).toBeVisible()
  await expect(page.locator('.evolution-history-pages')).toHaveCount(0)
  await page.getByRole('tab').last().press('ArrowLeft')
  await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected','true')
  await nav(0)
  const game=(await snapshot()).game,now=new Date().toISOString()
  game.pets=[{id:'pet:1',family:18,phase:1,xp:49_800_000,shiny:true,eggType:'normal',obtainedAt:now,path:[133],evolutionTarget:null,ball:'luxury'},
    {id:'pet:2',family:0,phase:1,xp:12_500_000,shiny:false,eggType:'grass',obtainedAt:now,path:[1],evolutionTarget:null},
    {id:'pet:3',family:0,phase:3,xp:0,shiny:false,eggType:'grass',obtainedAt:now,path:[1,2,3],evolutionTarget:null},
    {id:'pet:4',family:null,phase:0,xp:250_000,shiny:false,eggType:'fire',obtainedAt:null,path:[],evolutionTarget:null}]
  const catalog=JSON.parse(readFileSync(new URL('../src/shared/localized-catalog.json',import.meta.url),'utf8'))
  Object.assign(game,{activeId:'pet:1',displayPhase:1,nextId:5,candyTokens:3_000_000,tokensEarned:60_000_000,owned:Object.keys(catalog.species).map(Number),ownedShiny:[133],captures:[{petId:'pet:3',family:0,speciesId:3,shiny:false,completedAt:now}]})
  for(let i=1;i<23;i++)game.captures.push({petId:`history:${i}`,family:0,speciesId:3,shiny:i%2===0,completedAt:new Date(Date.parse(now)+i*1000).toISOString()})
  await application.close();application=null
  const fixture=join(directory,'fixture.json');writeFileSync(fixture,JSON.stringify(game))
  expect(spawnSync(electron,['scripts/collection-fixture.cjs',join(data,'poketoken.sqlite'),fixture],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:'inherit'}).status).toBe(0)
  await start()
  const stable=(await snapshot()).game
  const original=await application.evaluate(({Menu})=>{
    const original=Menu.buildFromTemplate
    globalThis.i18nTrayLabels=[]
    Menu.buildFromTemplate=function(template){globalThis.i18nTrayLabels=template.map(item=>item.label||'');return original.call(this,template)}
    return true
  });expect(original).toBe(true)
  for(const language of ['en','ja','ko']){
    await nav(3);await page.locator('.language-settings select').selectOption(language)
    await expect(page.locator('html')).toHaveAttribute('lang',language);await expect(pet.locator('html')).toHaveAttribute('lang',language)
    await expect.poll(async()=>(await snapshot()).settings.language).toBe(language)
    expect((await snapshot()).game).toEqual(stable)
    if(language!=='ko'){
      await noKorean();const labels=await application.evaluate(()=>globalThis.i18nTrayLabels);expect(labels.join('\n')).not.toMatch(/[가-힣]/)
      expect((await page.evaluate(()=>window.desktop.getDisplays())).map(d=>d.label).join(' ')).not.toMatch(/기본|화면/)
    }
    await nav(0)
    await expect(page.locator('.companion-description h2')).toContainText(catalog.species['133'][language])
    const options=await page.locator('.evolution-target option').allTextContents()
    for(const id of [134,135,136,196,197,470,471,700])expect(options.join(' ')).toContain(catalog.species[String(id)][language])
    await expect(pet.locator('.pet-bubble')).toBeVisible()
    if(language!=='ko'){await noKorean();expect(await pet.locator('.pet-bubble').innerText()).not.toMatch(/[가-힣]/)}
    for(const size of [[1040,800],[850,680]]){
      await application.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=dashboard')).setSize(...size),size)
      await fits();await page.screenshot({path:`artifacts/i18n-${language}-${size[0]}-${scale}.png`})
    }
    await page.locator('.egg-drawer summary').click();if(language!=='ko')await noKorean()
    const eggLabels=await page.locator('.egg-choice > strong').allTextContents()
    expect(eggLabels).toHaveLength(18)
    expect(eggLabels.every(label=>label.includes({en:'-type Egg',ja:'タイプのタマゴ',ko:'타입 알'}[language]))).toBe(true)
    await expect(page.locator('.egg-choice > small')).toHaveCount(0)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
    await page.locator('.egg-drawer summary').click()
    await nav(1)
    const sort=page.locator('.dex-filter select').last()
    await sort.selectOption('number')
    const ids=()=>page.locator('.dex-card').evaluateAll(cards=>cards.map(card=>Number(card.dataset.species)))
    await expect.poll(ids).toEqual([1,2,3,4,5,6,7,8,9])
    await sort.selectOption('name')
    const expectedNames=Object.keys(catalog.species).map(Number).sort((a,b)=>new Intl.Collator({en:'en-US',ja:'ja-JP',ko:'ko-KR'}[language],{sensitivity:'base',numeric:true}).compare(catalog.species[String(a)][language],catalog.species[String(b)][language])||a-b)
    await expect.poll(ids).toEqual(expectedNames.slice(0,9))
    await sort.selectOption('acquired')
    await expect.poll(ids).toEqual([...game.owned].reverse().slice(0,9))
    await page.locator('.segmented button').filter({hasText:language==='en'?'Shiny Pokédex':language==='ja'?'色違い図鑑':'이로치 도감'}).click()
    await expect.poll(ids).toEqual([133,1,2,3,4,5,6,7,8])
    await page.locator('.segmented button').filter({hasText:language==='en'?'Normal Pokédex':language==='ja'?'通常図鑑':'일반 도감'}).click()
    await page.getByRole('tab').nth(1).click()
    await expect(page.locator('.dex-grid')).toHaveCount(0)
    await expect(page.locator('.evolution-history-list li')).toHaveCount(10)
    await expect(page.locator('.evolution-history-list time').first()).toHaveAttribute('datetime',game.captures.at(-1).completedAt)
    const historyDates=()=>page.locator('.evolution-history-list time').evaluateAll(times=>times.map(time=>time.dateTime))
    const allHistoryDates=[...await historyDates()]
    await page.screenshot({path:`artifacts/i18n-history-${language}-${scale}.png`,fullPage:true})
    const pager=page.locator('.evolution-history-pages')
    await expect(pager.locator('button').first()).toBeDisabled()
    await pager.locator('button').last().click();await expect(page.locator('.evolution-history-list li')).toHaveCount(10)
    allHistoryDates.push(...await historyDates())
    await pager.locator('button').last().click();await expect(page.locator('.evolution-history-list li')).toHaveCount(3)
    allHistoryDates.push(...await historyDates())
    expect(allHistoryDates).toEqual([...game.captures].reverse().map(c=>c.completedAt))
    await expect(pager.locator('button').last()).toBeDisabled()
    await expect(page.locator('.evolution-history-list time').last()).toHaveAttribute('datetime',game.captures[0].completedAt)
    if(language!=='ko')await noKorean()
    await page.getByRole('tab').first().click()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
    for(const query of ['Bulbasaur','フシギダネ','이상해씨']){
      await page.locator('.dex-search input').fill(query);await expect(page.locator('.dex-card')).toHaveCount(1)
      await expect(page.locator('.dex-card h3')).toHaveText(catalog.species['1'][language])
    }
    await page.locator('.dex-search input').fill('');if(language!=='ko')await noKorean()
    await nav(2);if(language!=='ko')await noKorean()
    const images=await page.locator('.ball-collection .ball-icon').evaluateAll(imgs=>imgs.map(img=>({id:img.dataset.ball,width:img.naturalWidth,height:img.naturalHeight,rendering:getComputedStyle(img).imageRendering,loaded:img.complete})))
    expect(images).toHaveLength(7);expect(images.every(i=>i.width===160&&i.height===160&&i.rendering==='auto'&&i.loaded)).toBe(true)
    await page.screenshot({path:`artifacts/i18n-balls-${language}-${scale}.png`,fullPage:true})
    checks.push(`${language}: immediate UI/pet/tray language, official names, all evolution targets, cross-language search, three sorts, separate shiny acquisition order, all 23 history records in pages of 10/10/3, typed egg names without hatch spoilers, seven local 160px balls, minimum-size home and preserved game`)
  }
  // Persist the added language across a complete process restart.
  await page.evaluate(()=>window.desktop.updateSettings({language:'ja',inBall:true}))
  await expect(pet.locator('.pet-character .ball-icon')).toBeVisible()
  expect(await pet.locator('.pet-character').evaluate(el=>Math.round(el.getBoundingClientRect().width))).toBe(40)
  await application.close();application=null;await start()
  expect((await snapshot()).settings.language).toBe('ja');expect((await snapshot()).game).toEqual(stable)
  expect((await snapshot()).settings.dexSort).toBe('acquired')
  const rejectedSort=await page.evaluate(async()=>{try{await window.desktop.updateSettings({dexSort:'random'});return false}catch{return true}})
  expect(rejectedSort).toBe(true)
  await expect(page.locator('html')).toHaveAttribute('lang','ja');await noKorean()
  await page.evaluate(()=>window.desktop.updateSettings({inBall:false}))
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).webContents.send('pet:petting'))
  await expect(pet.locator('.pet-bubble')).toBeVisible();expect(await pet.locator('.pet-bubble').innerText()).not.toMatch(/[가-힣]/)
  const rejected=await page.evaluate(async()=>{try{await window.desktop.updateSettings({language:'fr'});return false}catch{return true}})
  expect(rejected).toBe(true);expect((await snapshot()).settings.language).toBe('ja')
  checks.push('Japanese survives restart and ball recall/send-out; 40px ball geometry is preserved; invalid language is rejected')
  await nav(0);await page.locator('.evolution-target').selectOption('700')
  await expect(page.locator('.home-footer')).toContainText('ニンフィア');await noKorean()
  await page.locator('.candy-actions input').fill('2');await page.locator('.candy-actions .primary').click()
  await expect(page.locator('.companion-description h2')).toHaveText('✦ 色違い ニンフィア')
  await noKorean()
  const evolved=await snapshot(),active=evolved.game.pets.find(p=>p.id===evolved.game.activeId)
  expect(active.path).toEqual([133,700]);expect(evolved.game.candyTokens).toBe(stable.candyTokens-200_000)
  expect(evolved.game.tokensEarned).toBe(stable.tokensEarned)
  checks.push('Japanese evolution selection, candy use and actual Eevee evolution use official Sylveon names and translated notices while preserving XP accounting')
  expect(errors).toEqual([])
  const version=JSON.parse(readFileSync('package.json','utf8')).version
  writeFileSync(`artifacts/i18n-smoke-${scale}.json`,JSON.stringify({version,directory,checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2))
}catch(error){
  await page?.screenshot({path:`artifacts/i18n-failure-${scale}.png`,fullPage:true}).catch(()=>{})
  writeFileSync(`artifacts/i18n-failure-${scale}.json`,JSON.stringify({directory,error:String(error),checks,errors},null,2));throw error
}finally{if(application)await application.close()}
