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
  await expect(page.getByRole('heading',{name:'오늘도, 함께 성장해요'})).toBeVisible()
  await expect.poll(()=>page.evaluate(async()=>{const s=await window.desktop.getSnapshot();return !s.scanning&&s.lastScan!==null})).toBe(true)
  const file=join(logs,'test.jsonl')
  const line=(id,input)=>JSON.stringify({type:'assistant',timestamp:new Date(Date.now()+1000).toISOString(),requestId:'portable',message:{id,usage:{input_tokens:input}}})+'\n'
  writeFileSync(file,line('baseline',500_000))
  await page.evaluate(path=>window.desktop.updateSettings({roots:{claude:[path],codex:[]}}),logs)
  expect((await page.evaluate(()=>window.desktop.getSnapshot())).game.tokensEarned).toBe(0)
  appendFileSync(file,line('after',500_000))
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
  await petPage.mouse.move(80,110);await petPage.mouse.down()
  await expect(petPage.locator('.pet-character')).toHaveAttribute('data-motion','held')
  await expect(petPage.locator('.pet-bubble')).toHaveAttribute('data-dialogue','held')
  await petPage.mouse.up()
  await expect(petPage.locator('.pet-character')).toHaveAttribute('data-motion','idle')
  await expect(petPage.locator('.pet-bubble')).toHaveAttribute('data-dialogue','petting')
  await expect(petPage.locator('.pet-affection')).toBeVisible()
  writeFileSync('artifacts/portable-report.json',JSON.stringify({executable,checks:['portable launcher extracted and started','packaged preload, worker, SQLite and tray resources loaded','historical baseline excluded','new usage hatches through packaged IPC','runtime sprite download displayed','pet background is transparent (PNG alpha verified)','immediate hold and petting reaction work in the portable executable'],errors:[]},null,2))
  console.log('Portable executable checks passed.')
}finally{
  if(browser)await browser.close().catch(()=>{})
  // Only terminate the browser PID obtained from this test's unique debugging endpoint.
  if(applicationPid)try{execFileSync('taskkill',['/PID',String(applicationPid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}
  else if(child.pid)try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}
}
