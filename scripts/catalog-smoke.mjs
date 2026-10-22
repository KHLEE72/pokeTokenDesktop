import {_electron as electronApp,expect} from './test-electron.mjs'
import electron from 'electron'
import {spawnSync} from 'node:child_process'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const directory=mkdtempSync(join(tmpdir(),'poketoken-catalog-')),data=join(directory,'data')
const env={...process.env,POKETOKEN_DATA_DIR:data,POKETOKEN_TEST_MODE:'1'};delete env.ELECTRON_RUN_AS_NODE
const catalog=JSON.parse(readFileSync('src/shared/catalog-data.json','utf8'))
const names=JSON.parse(readFileSync('src/shared/localized-catalog.json','utf8')).species
const manifest=JSON.parse(readFileSync('src/shared/sprite-catalog.json','utf8'))
const supplemental=JSON.parse(readFileSync('src/shared/extra-sprite-catalog.json','utf8'))
const scale=process.env.POKETOKEN_TEST_SCALE||'native',checks=[],errors=[],images=[]
const ids=[1,152,252,387,495,650,722,810,906,1025,132]
mkdirSync('artifacts',{recursive:true})
let application,page
const snapshot=()=>page.evaluate(()=>window.desktop.getSnapshot())
const nav=index=>page.locator(`.sidebar nav button[data-tab="${['home','dex','achievements','settings'][index]}"]`).click()
async function start(){
  application=await electronApp.launch({executablePath:process.env.POKETOKEN_EXE||electron,args:[...(process.env.POKETOKEN_EXE?[]:['.']),...(scale==='native'?[]:[`--force-device-scale-factor=${scale}`])],env,timeout:60000})
  await application.firstWindow();page=application.windows().find(w=>w.url().includes('view=dashboard'))
  page.on('pageerror',error=>errors.push(error.message))
  await expect.poll(async()=>Boolean((await snapshot()).lastScan)).toBe(true)
  await page.evaluate(async()=>{await document.fonts.ready;await window.desktop.updateSettings({paused:true,theme:'dark'})})
}
try{
  await start();const game=(await snapshot()).game,now=new Date().toISOString()
  game.pets=[];game.owned=[];game.ownedShiny=[];game.captures=[]
  for(const id of ids)for(const shiny of [false,true]){
    const p=catalog.pokemon.find(p=>p.id===id),pet={id:`pet:${game.pets.length+1}`,family:p.family,phase:1,path:[id],evolutionTarget:null,xp:0,eggType:catalog.families[p.family].eggTypes[0],shiny,obtainedAt:now}
    game.pets.push(pet);game[shiny?'ownedShiny':'owned'].push(id)
    if(!catalog.evolutions[id].length)game.captures.push({petId:pet.id,family:p.family,speciesId:id,shiny,completedAt:now})
  }
  for(const path of [[280,281],[935]]){
    const p=catalog.pokemon.find(p=>p.id===path.at(-1))
    game.pets.push({id:`pet:${game.pets.length+1}`,family:p.family,phase:path.length,path,evolutionTarget:null,xp:(path.length===1?50_000_000:100_000_000)-1,eggType:catalog.families[p.family].eggTypes[0],shiny:true,obtainedAt:now})
    game.ownedShiny.push(...path)
  }
  Object.assign(game,{activeId:'pet:1',displayPhase:1,nextId:game.pets.length+1,candyTokens:1_000_000,tokensEarned:500_000_000})
  await application.close();application=null
  const fixture=join(directory,'fixture.json');writeFileSync(fixture,JSON.stringify(game))
  expect(spawnSync(electron,['scripts/collection-fixture.cjs',join(data,'poketoken.sqlite'),fixture],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:'inherit'}).status).toBe(0)
  await start();expect((await snapshot()).game).toEqual(game)
  for(const candidate of game.pets.slice(0,ids.length*2)){
    const id=candidate.path[0]
    await page.evaluate(petId=>window.desktop.gameAction({type:'select',petId,phase:1}),candidate.id)
    await expect(page.locator('.habitat-sprite img')).toHaveAttribute('alt',names[id].ko,{timeout:30000})
    await expect.poll(()=>page.locator('.habitat-sprite img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true)
    const image=await page.locator('.habitat-sprite img').evaluate(img=>({mime:img.src.slice(0,img.src.indexOf(';')),width:img.naturalWidth,height:img.naturalHeight}))
    const variant=candidate.shiny?'shiny':'normal',format=manifest.animated[variant].includes(id)||supplemental.pokemon.find(p=>p.id===id)?.[variant]?'gif':'png'
    expect(image.mime).toBe(`data:image/${format}`);images.push({id,shiny:candidate.shiny,...image})
  }
  checks.push('normal and shiny sprites from all nine generations, including animated Sprigatito and Pecharunt, load and render in the real app')
  await nav(1)
  const generation=page.getByRole('combobox',{name:'도감 세대 필터'}),pager=page.getByRole('navigation',{name:'도감 위쪽 페이지 이동'}).getByRole('combobox',{name:'이동할 도감 페이지'})
  for(let gen=1;gen<=9;gen++){
    const expected=catalog.pokemon.filter(p=>p.generation===gen).map(p=>p.id)
    await generation.selectOption(String(gen));await expect(pager).toHaveValue('1')
    await expect.poll(()=>page.locator('.dex-card').evaluateAll(cards=>cards.map(c=>Number(c.dataset.species)))).toEqual(expected.slice(0,9))
    const pages=Math.ceil(expected.length/9)
    await expect(pager.locator('option')).toHaveCount(pages)
    await pager.selectOption(String(pages))
    await expect.poll(()=>page.locator('.dex-card').evaluateAll(cards=>cards.map(c=>Number(c.dataset.species)))).toEqual(expected.slice((pages-1)*9))
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  }
  await generation.selectOption('all');await pager.selectOption('114')
  await expect.poll(()=>page.locator('.dex-card').evaluateAll(cards=>cards.map(c=>Number(c.dataset.species)))).toEqual([1018,1019,1020,1021,1022,1023,1024,1025])
  await page.getByRole('searchbox',{name:'포켓몬 이름 또는 도감 번호 검색'}).fill('No. 1025')
  await expect(page.locator('.dex-card')).toHaveCount(1);await expect(page.locator('.dex-card')).toHaveAttribute('data-species','1025')
  await page.screenshot({path:`artifacts/catalog-generation-nine-${scale}.png`,fullPage:true})
  checks.push('all nine generation counts, first/last pages, 114-page full roster and four-digit National Pokédex search work without horizontal overflow')
  await nav(0)
  for(const [index,target] of [[ids.length*2,475],[ids.length*2+1,937]]){
    const pet=game.pets[index]
    await page.evaluate(pet=>window.desktop.gameAction({type:'select',petId:pet.id,phase:pet.phase}),pet)
    await page.locator('.evolution-target').selectOption(String(target))
    await page.locator('.candy-actions input').fill('1');await page.locator('.candy-actions .primary').click()
    await expect(page.locator('.companion-description h2')).toContainText(names[target].ko)
    const updated=await snapshot(),current=updated.game.pets.find(p=>p.id===pet.id)
    expect(current.path).toEqual([...pet.path,target]);expect(current.shiny).toBe(true)
    expect(updated.game.captures.some(c=>c.petId===pet.id&&c.speciesId===target)).toBe(true)
  }
  const after=(await snapshot()).game
  expect(after.candyTokens).toBe(game.candyTokens-2);expect(after.tokensEarned).toBe(game.tokensEarned)
  checks.push('Kirlia → Gallade and Charcadet → Ceruledge target selection and candy evolution record the actual shiny paths and spend only required XP')
  await application.close();application=null;await start()
  expect((await snapshot()).game).toEqual(after)
  const cached=await page.evaluate(async()=>Promise.all([window.desktop.getSprite(906),window.desktop.getSprite(1025,true)]))
  expect(cached.every(uri=>uri.startsWith('data:image/gif;'))).toBe(true)
  checks.push('new species, shiny branches, candy, capture records and GIF/PNG cache survive complete process restart')
  expect(errors).toEqual([])
  writeFileSync(`artifacts/catalog-smoke-${scale}.json`,JSON.stringify({version:JSON.parse(readFileSync('package.json','utf8')).version,directory,checks,images,errors},null,2))
  console.log(JSON.stringify({checks,images,errors},null,2))
}finally{if(application)await application.close()}
