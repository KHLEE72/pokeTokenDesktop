import {_electron as electronApp,expect} from '@playwright/test'
import electron from 'electron'
import {spawnSync} from 'node:child_process'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const directory=mkdtempSync(join(tmpdir(),'poketoken-rarity-')),data=join(directory,'data')
const env={...process.env,POKETOKEN_DATA_DIR:data,POKETOKEN_TEST_MODE:'1'};delete env.ELECTRON_RUN_AS_NODE
const scale=process.env.POKETOKEN_TEST_SCALE||'native',checks=[],errors=[]
const catalog=JSON.parse(readFileSync('src/shared/catalog-data.json','utf8'))
const names=JSON.parse(readFileSync('src/shared/localized-catalog.json','utf8')).species
const characterData=JSON.parse(readFileSync('src/shared/character-profiles.json','utf8'))
const labels={en:{sublegendary:'Sub-Legendary',legendary:'Legendary',mythical:'Mythical'},ko:{sublegendary:'준전설',legendary:'전설',mythical:'환상'},ja:{sublegendary:'準伝説',legendary:'伝説',mythical:'幻'}}
const ids=[144,145,146,150,151,778,359,959,129,132,376,282,54,143,1025]
mkdirSync('artifacts',{recursive:true})
let application,page,pet
const snapshot=()=>page.evaluate(()=>window.desktop.getSnapshot())
const nav=async index=>{await page.locator('.sidebar nav button').nth(index).click();await page.evaluate(()=>scrollTo(0,0))}
async function start(){
  application=await electronApp.launch({executablePath:process.env.POKETOKEN_EXE||electron,args:[...(process.env.POKETOKEN_EXE?[]:['.']),...(scale==='native'?[]:[`--force-device-scale-factor=${scale}`])],env,timeout:60000})
  await application.firstWindow();await expect.poll(()=>application.windows().some(w=>w.url().includes('view=pet'))).toBe(true)
  page=application.windows().find(w=>w.url().includes('view=dashboard'));pet=application.windows().find(w=>w.url().includes('view=pet'))
  for(const p of [page,pet])p.on('pageerror',e=>errors.push(e.message))
  await expect.poll(async()=>Boolean((await snapshot()).lastScan)).toBe(true)
  await page.evaluate(async()=>{await document.fonts.ready;await window.desktop.updateSettings({paused:true})})
}
async function fits(){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  if(await page.locator('.home-page').count())expect(await page.evaluate(()=>document.documentElement.scrollHeight===innerHeight)).toBe(true)
}
try{
  await start();const game=(await snapshot()).game,now=new Date().toISOString()
  game.pets=ids.map((id,index)=>{
    const p=catalog.pokemon.find(p=>p.id===id),family=catalog.families[p.family]
    const route=target=>{if(target===id)return [target];for(const child of catalog.evolutions[target]){const found=route(child);if(found)return[target,...found]}return null}
    return{id:`pet:${index+1}`,family:p.family,phase:p.phase,path:route(family.species[0]),evolutionTarget:null,xp:0,eggType:family.eggTypes[0],shiny:false,obtainedAt:now,ball:'poke'}
  })
  Object.assign(game,{activeId:'pet:6',displayPhase:1,nextId:game.pets.length+1,candyTokens:123_456,tokensEarned:0,owned:[...new Set(game.pets.flatMap(p=>p.path))],ownedShiny:[144],captures:game.pets.filter(p=>!catalog.evolutions[p.path.at(-1)].length).map(p=>({petId:p.id,family:p.family,speciesId:p.path.at(-1),shiny:false,completedAt:now}))})
  const displayFirst=[144,145,146,150,151,1025]
  game.owned=[...game.owned.filter(id=>!displayFirst.includes(id)),...displayFirst]
  await application.close();application=null
  const fixture=join(directory,'fixture.json');writeFileSync(fixture,JSON.stringify(game))
  expect(spawnSync(electron,['scripts/collection-fixture.cjs',join(data,'poketoken.sqlite'),fixture],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:'inherit'}).status).toBe(0)
  await start();expect((await snapshot()).game).toEqual(game)
  const rewards=(await snapshot()).rewards
  for(const ball of ['timer','dream','cherish'])expect(rewards.unlocked[ball]).toBeTruthy()
  checks.push('existing normal/shiny records backfill three new rewards without changing game, candy or earned tokens')
  for(const language of ['en','ja','ko']){
    await page.evaluate(language=>window.desktop.updateSettings({language}),language)
    await nav(1)
    const rarity=page.locator('.dex-filter select').nth(3)
    await page.locator('.dex-filter select').last().selectOption('number')
    for(const [category,count] of [['sublegendary',44],['legendary',27],['mythical',23]]){
      await rarity.selectOption(category)
      await expect(page.locator('.dex-card')).toHaveCount(9)
      await expect(page.locator('.dex-card').first()).toHaveAttribute('data-rarity',category)
      await expect(page.locator('.rarity-badge').first()).toContainText(labels[language][category])
      expect(await page.locator('.dex-filter-summary').innerText()).toContain(String(count))
      await fits()
    }
    await rarity.selectOption('all');await page.locator('.dex-filter select').nth(2).selectOption('discovered')
    await page.locator('.dex-filter select').last().selectOption('acquired')
    await expect.poll(()=>page.locator('.dex-card img:not(.ball-icon)').evaluateAll(imgs=>imgs.length===9&&imgs.every(img=>img.complete&&img.naturalWidth>0)),{timeout:40000}).toBe(true)
    await page.screenshot({path:`artifacts/rarity-dex-${language}-${scale}.png`,fullPage:true})
    await page.locator('.dex-filter select').nth(2).selectOption('all')
    await nav(2)
    await expect(page.locator('.achievement-card')).toHaveCount(9)
    const art=await page.locator('.ball-collection .ball-icon').evaluateAll(imgs=>imgs.map(img=>({width:img.naturalWidth,height:img.naturalHeight,loaded:img.complete})))
    expect(art).toHaveLength(10);expect(art.every(i=>i.loaded&&i.width===160&&i.height===160)).toBe(true)
    await fits();await page.screenshot({path:`artifacts/rarity-rewards-${language}-${scale}.png`,fullPage:true})
    if(language!=='ko')expect((await page.locator('body').innerText()).replaceAll('한국어','')).not.toMatch(/[가-힣]/)
    checks.push(`${language}: three category filters and counts, styled badges, nine achievements and ten original ball images render without overflow`)
  }
  await nav(3)
  const palettes=[]
  for(const [theme,name] of [['timer','타이머볼'],['dream','드림볼'],['cherish','프레셔스볼']]){
    await page.getByRole('button',{name:`${name} 테마`,exact:true}).click()
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme',theme)
    palettes.push(await page.locator('.app-shell').evaluate(el=>getComputedStyle(el).backgroundColor))
    await nav(0)
    await page.locator('.ball-picker select').selectOption(theme)
    await expect.poll(async()=>(await snapshot()).game.pets.find(p=>p.id===game.activeId).ball).toBe(theme)
    for(const size of [[1040,800],[850,680]]){
      await application.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=dashboard')).setSize(...size),size)
      await fits();await page.screenshot({path:`artifacts/rarity-theme-${theme}-${size[0]}-${scale}.png`})
    }
    await nav(3)
  }
  expect(new Set(palettes).size).toBe(3)
  checks.push('Timer, Dream and Cherish palettes are distinct, apply to home at default/minimum window sizes and equip independently on the same individual')
  await pet.addInitScript(()=>{Math.random=()=>0});await pet.reload()
  await application.evaluate(({screen,BrowserWindow})=>{const b=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).getContentBounds();const cursor={x:b.x+b.width/2,y:b.y+b.height/2};screen.getCursorScreenPoint=()=>cursor})
  await nav(0)
  for(const [id,event,word] of [[778,'held','천'],[282,'petting','뿔'],[359,'petting','불길'],[959,'held','망치'],[143,'petting','배'],[376,'petting','정보']]){
    const candidate=game.pets.find(p=>p.path.at(-1)===id)
    await page.evaluate(p=>window.desktop.gameAction({type:'select',petId:p.id,phase:p.phase}),candidate)
    if(event==='held')await pet.evaluate(()=>window.desktop.drag('start'))
    else await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).webContents.send('pet:petting'))
    await expect(pet.locator('.pet-bubble')).toContainText(word)
    if(id===778&&event==='held')await pet.screenshot({path:`artifacts/rarity-mimikyu-held-${scale}.png`,omitBackground:true})
    const bounds=await pet.locator('.pet-bubble').evaluate(el=>{const r=el.getBoundingClientRect(),s=el.querySelector('span').getBoundingClientRect(),p=document.querySelector('.pet-character').getBoundingClientRect();return{top:r.top,bottom:r.bottom,textTop:s.top,textBottom:s.bottom,characterTop:p.top}})
    expect(bounds.top).toBeGreaterThanOrEqual(0);expect(bounds.bottom).toBeLessThanOrEqual(bounds.characterTop);expect(bounds.textTop).toBeGreaterThanOrEqual(bounds.top);expect(bounds.textBottom).toBeLessThanOrEqual(bounds.characterTop)
    if(event==='held')await pet.evaluate(()=>window.desktop.drag('cancel'))
  }
  checks.push('Mimikyu cloth, Gardevoir empathy, Absol warning, Tinkaton hammer, Snorlax belly and Metagross calculation dialogue appear in the real pet window and fit above the sprite')
  const speechOverflows=[];let speechSamples=0
  for(const language of ['en','ja','ko']){
    await page.evaluate(language=>window.desktop.updateSettings({language,size:96}),language)
    await expect.poll(()=>pet.evaluate(()=>innerWidth)).toBe(144)
    const samples=[...Object.values(characterData.facts).map(f=>({text:f.text[language],summary:null})),...Object.values(characterData.profiles).filter(p=>p.signature).map(p=>({text:p.signature[language],summary:null})),...Object.values(characterData.scenes).flatMap(events=>Object.entries(events).flatMap(([event,rows])=>rows.map(row=>({text:row[language],summary:event==='growth'?{en:'Evolution ×1',ja:'進化1回',ko:'진화 1회'}[language]:null}))))]
    speechSamples+=samples.length
    const overflows=await pet.evaluate(async samples=>{
      await document.fonts.ready
      const box=document.createElement('div');box.className='pet-bubble';box.style.visibility='hidden'
      const text=document.createElement('span'),summary=document.createElement('small');box.append(text)
      document.querySelector('.pet-surface').append(box)
      const characterTop=document.querySelector('.pet-character').getBoundingClientRect().top,errors=[]
      for(const sample of samples){
        text.textContent=sample.text
        if(sample.summary){summary.textContent=sample.summary;box.append(summary)}else summary.remove()
        const r=box.getBoundingClientRect(),t=text.getBoundingClientRect(),s=sample.summary?summary.getBoundingClientRect():t
        if(t.top<r.top||Math.max(t.bottom,s.bottom)>characterTop)errors.push({text:sample.text,summary:sample.summary,top:r.top,textBottom:t.bottom,summaryBottom:s.bottom,characterTop})
      }
      box.remove();return errors
    },samples)
    speechOverflows.push(...overflows.map(row=>({language,...row})))
  }
  writeFileSync(`artifacts/speech-layout-${scale}.json`,JSON.stringify({checked:speechSamples,overflows:speechOverflows},null,2))
  expect(speechOverflows.length,JSON.stringify(speechOverflows.slice(0,4))).toBe(0)
  checks.push('every authored profile, fact and context line, including growth summaries, fits above a 96px pet in all three languages')
  const stable=(await snapshot()).game,settings=(await snapshot()).settings
  await application.close();application=null;await start()
  expect((await snapshot()).game).toEqual(stable);expect((await snapshot()).settings.theme).toBe(settings.theme)
  expect((await snapshot()).rewards).toEqual(rewards)
  await expect(page.locator('.reward-toast')).toHaveCount(0)
  checks.push('all new unlock dates, equipped balls, selected theme, candy and paths survive restart without repeated reward notifications')
  expect(errors).toEqual([])
  writeFileSync(`artifacts/rarity-smoke-${scale}.json`,JSON.stringify({version:JSON.parse(readFileSync('package.json','utf8')).version,directory,checks,errors},null,2))
  console.log(JSON.stringify({checks,errors},null,2))
}finally{if(application)await application.close()}
