import {_electron as electronApp,expect} from './test-electron.mjs'
import electron from 'electron'
import {spawnSync} from 'node:child_process'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'

const directory=mkdtempSync(join(tmpdir(),'poketoken-extra-sprites-')),data=join(directory,'data')
const env={...process.env,POKETOKEN_DATA_DIR:data,POKETOKEN_TEST_MODE:'1'};delete env.ELECTRON_RUN_AS_NODE
const catalog=JSON.parse(readFileSync('src/shared/catalog-data.json','utf8'))
const forms=JSON.parse(readFileSync('src/shared/form-catalog.json','utf8')).forms
const extra=JSON.parse(readFileSync('src/shared/extra-sprite-catalog.json','utf8'))
const names=JSON.parse(readFileSync('src/shared/localized-catalog.json','utf8')).species
const spriteNames=id=>forms.find(p=>p.id===id)?.names||names[id]
const checks=[],errors=[],images=[]
let application,page,pet
const snapshot=()=>page.evaluate(()=>window.desktop.getSnapshot())
async function start(){
  application=await electronApp.launch({executablePath:process.env.POKETOKEN_EXE||electron,args:process.env.POKETOKEN_EXE?[]:['.'],env,timeout:60000})
  await application.firstWindow()
  page=application.windows().find(w=>w.url().includes('view=dashboard'))
  await expect.poll(()=>application.windows().some(w=>w.url().includes('view=pet'))).toBe(true)
  pet=application.windows().find(w=>w.url().includes('view=pet'))
  for(const window of [page,pet])window.on('pageerror',error=>errors.push(error.message))
  await expect.poll(async()=>Boolean((await snapshot()).lastScan)).toBe(true)
  await page.evaluate(()=>window.desktop.updateSettings({paused:true}))
}
async function movingPixels(window=page,selector='.habitat-sprite img'){
  // Canvas drawImage uses a GIF's default frame; sample the actual compositor instead.
  const samples=new Set()
  for(let i=0;i<8;i++){
    const screenshot=await window.locator(selector).screenshot({animations:'disabled'})
    samples.add(createHash('sha256').update(screenshot).digest('hex'))
    await new Promise(resolve=>setTimeout(resolve,120))
  }
  return samples.size
}
try{
  await start();const game=(await snapshot()).game,now=new Date().toISOString()
  game.pets=[];game.owned=[];game.ownedShiny=[];game.captures=[]
  const representatives=[940,909,983,701,906,655,1017,10176,10301,10282,10283,10298],selections=[]
  game.appearances={owned:[],ownedShiny:[],megaStones:[],freeMegaStoneUsed:true}
  for(const id of representatives)for(const shiny of [false,true]){
    const form=forms.find(p=>p.id===id),baseId=form?.kind==='mega'?form.baseAppearanceId:id
    const species=catalog.pokemon.find(p=>p.id===baseId)||forms.find(p=>p.id===baseId)
    const petId=`pet:${game.pets.length+1}`
    game.pets.push({id:petId,family:species.family,phase:1,path:[baseId],evolutionTarget:null,xp:0,eggType:species.types[0],shiny,obtainedAt:now})
    const collection=baseId>1025?game.appearances:game
    collection[shiny?'ownedShiny':'owned'].push(baseId)
    if(form?.kind==='mega'){
      game.appearances[shiny?'ownedShiny':'owned'].push(id)
      if(!game.appearances.megaStones.includes(form.stone))game.appearances.megaStones.push(form.stone)
    }
    selections.push({id,petId,shiny,mega:form?.kind==='mega'})
  }
  Object.assign(game,{activeId:'pet:1',displayPhase:1,nextId:game.pets.length+1,candyTokens:12345,tokensEarned:0})
  await application.close();application=null
  const fixture=join(directory,'fixture.json');writeFileSync(fixture,JSON.stringify(game))
  expect(spawnSync(electron,['scripts/collection-fixture.cjs',join(data,'poketoken.sqlite'),fixture],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:'inherit'}).status).toBe(0)
  mkdirSync(join(data,'sprites'),{recursive:true})
  for(const id of [940,909,701,906,10301])writeFileSync(join(data,'sprites',`${id}.png`),readFileSync('src/renderer/src/assets/rare-candy.png'))
  await start()
  await expect(page.locator('.habitat-sprite img')).toHaveAttribute('alt',names[940].ko)
  await expect.poll(()=>page.locator('.habitat-sprite img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true)
  await expect(pet.locator('.pet-character img')).toHaveAttribute('src',/data:image\/gif;/)
  expect(await movingPixels()).toBeGreaterThan(1)
  checks.push('bundled 2D Wattrel replaces an old PNG immediately and its actual image pixels animate in the dashboard and GIF renders in the pet window')
  await expect.poll(()=>page.evaluate(()=>window.desktop.getSprite(909)),{timeout:30000}).toMatch(/^data:image\/gif;/)
  expect(readFileSync(join(data,'sprites','909.png')).length).toBeGreaterThan(0)
  expect(readFileSync(join(data,'sprites','909.gif')).length).toBeGreaterThan(0)
  checks.push('old cached PNG remains usable while the real background download upgrades Fuecoco to an animated GIF without deleting user cache files')
  const candidates=extra.pokemon.flatMap(p=>[false,true].filter(shiny=>p[shiny?'shiny':'normal']).map(shiny=>({id:p.id,shiny,expected:p[shiny?'shiny':'normal']})))
  for(let index=0;index<candidates.length;index+=4){
    const batch=candidates.slice(index,index+4)
    const decoded=await page.evaluate(async batch=>Promise.all(batch.map(async candidate=>{
      const uri=await window.desktop.getSprite(candidate.id,candidate.shiny)
      if(!uri?.startsWith('data:image/gif;'))throw Error(`No GIF for ${candidate.id}:${candidate.shiny}`)
      const bytes=Uint8Array.from(atob(uri.split(',')[1]),c=>c.charCodeAt(0))
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('')
      const decoder=new ImageDecoder({data:bytes,type:'image/gif'}),unique=new Set()
      try{
        await decoder.tracks.ready
        const frames=decoder.tracks.selectedTrack.frameCount
        const canvas=new OffscreenCanvas(candidate.expected.width,candidate.expected.height),context=canvas.getContext('2d',{willReadFrequently:true})
        for(let i=0;i<frames;i++){
          const frame=await decoder.decode({frameIndex:i})
          try{
            context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(frame.image,0,0)
            const pixels=context.getImageData(0,0,canvas.width,canvas.height).data
            unique.add(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))).map(n=>n.toString(16).padStart(2,'0')).join(''))
          }finally{frame.image.close()}
        }
        return {id:candidate.id,shiny:candidate.shiny,sha256:hash,frames,uniqueFrames:unique.size}
      }finally{decoder.close()}
    })),batch)
    for(let n=0;n<decoded.length;n++){
      expect(decoded[n].sha256).toBe(batch[n].expected.sha256)
      expect(decoded[n].frames).toBe(batch[n].expected.frames)
      expect(decoded[n].frames).toBeGreaterThan(1)
      expect(decoded[n].uniqueFrames).toBeGreaterThan(1);images.push(decoded[n])
    }
    if(images.length%100===0||images.length===candidates.length)console.log(`Decoded and verified GIFs: ${images.length}/${candidates.length}`)
  }
  expect(images).toHaveLength(504)
  checks.push('all 255 additional appearances (504 GIF variants) load through production IPC/cache; every Chromium-decoded frame is inspected and each image has real pixel changes, the audited frame count and exact SHA-256')
  for(const candidate of selections){
    await page.evaluate(candidate=>window.desktop.gameAction(candidate.mega?{type:'mega',petId:candidate.petId,formId:candidate.id}:{type:'select',petId:candidate.petId,phase:1}),candidate)
    const uri=await page.evaluate(candidate=>window.desktop.getSprite(candidate.id,candidate.shiny),candidate)
    await expect(page.locator('.habitat-sprite img')).toHaveAttribute('src',uri)
    await expect(pet.locator('.pet-character img')).toHaveAttribute('alt',spriteNames(candidate.id).ko)
    await expect(pet.locator('.pet-character img')).toHaveAttribute('src',uri)
    const staticShiny=candidate.shiny&&[10282,10283,10298].includes(candidate.id)
    if(staticShiny){
      expect(uri).toMatch(/^data:image\/png;/);expect(await movingPixels()).toBe(1)
    }else{
      expect(uri).toMatch(/^data:image\/gif;/);expect(await movingPixels()).toBeGreaterThan(1)
      if([701,10301].includes(candidate.id))expect(await movingPixels(pet,'.pet-character img')).toBeGreaterThan(1)
    }
    if(candidate.id===10301){
      await expect(page.locator('.habitat-sprite [data-artwork]')).toHaveCount(0)
      expect(await page.locator('.habitat-sprite img').evaluate(img=>getComputedStyle(img).imageRendering)).toBe('pixelated')
    }
    if(candidate.id===701&&!candidate.shiny)await page.screenshot({path:'artifacts/extra-sprites-hawlucha.png',fullPage:true})
  }
  await page.screenshot({path:'artifacts/extra-sprites-home.png',fullPage:true})
  for(const id of [701,906,10301])expect(readFileSync(join(data,'sprites',`${id}.png`))).toEqual(readFileSync('src/renderer/src/assets/rare-candy.png'))
  checks.push('normal/shiny Hawlucha, Sprigatito, Delphox, Ogerpon, Galarian Darumaka and Mega Zygarde visibly animate; old PNGs remain intact and Mega Zygarde renders as crisp pixels in home and pet windows')
  checks.push('only shiny Mega Meganium, Mega Feraligatr and Mega Barbaracle keep their original static PNGs; their normal variants animate and the static controls show no pixel changes')
  const saved=(await snapshot()).game
  await application.close();application=null;await start()
  expect((await snapshot()).game).toEqual(saved)
  const persisted=await page.evaluate(()=>Promise.all([window.desktop.getSprite(940,true),window.desktop.getSprite(909),window.desktop.getSprite(701),window.desktop.getSprite(10301,true)]))
  expect(persisted.every(uri=>uri.startsWith('data:image/gif;'))).toBe(true)
  expect(errors).toEqual([])
  checks.push('restart preserves growth, candy, dex, selection and animated caches; bundled normal/shiny sprites remain available')
  mkdirSync('artifacts',{recursive:true})
  writeFileSync('artifacts/sprites-report.json',JSON.stringify({version:JSON.parse(readFileSync('package.json','utf8')).version,directory,checks,images,errors},null,2))
  console.log(JSON.stringify({checks,images:images.length,errors},null,2))
}finally{if(application)await application.close()}
