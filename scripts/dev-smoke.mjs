import { chromium, expect } from '@playwright/test'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const port=server.address().port;await new Promise(resolve=>server.close(resolve))
const directory=mkdtempSync(join(tmpdir(),'poketoken-dev-'))
const child=spawn(process.execPath,['node_modules/electron-vite/bin/electron-vite.js','dev','--remoteDebuggingPort',String(port)],{env:{...process.env,POKETOKEN_DATA_DIR:directory,POKETOKEN_TEST_MODE:'1'},windowsHide:true,stdio:'pipe'})
let browser,pid;let logs=''
child.stdout.on('data',data=>{logs+=data});child.stderr.on('data',data=>{logs+=data})
try{
  await expect.poll(async()=>{try{return(await fetch(`http://127.0.0.1:${port}/json/version`)).ok}catch{return false}},{timeout:60_000}).toBe(true)
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const session=await browser.newBrowserCDPSession()
  pid=(await session.send('SystemInfo.getProcessInfo')).processInfo.find(p=>p.type==='browser').id
  await expect.poll(()=>browser.contexts()[0].pages().some(p=>p.url().includes('view=dashboard'))).toBe(true)
  const page=browser.contexts()[0].pages().find(p=>p.url().includes('view=dashboard'))
  await page.evaluate(()=>window.desktop.updateSettings({language:'ko'}))
  await expect(page.getByRole('heading',{name:'오늘도, 함께 성장해요'})).toBeVisible({timeout:30_000})
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.getByRole('button',{name:'설정',exact:false}).first().click()
  await expect(page.getByRole('heading',{name:'함께하는 방식'})).toBeVisible()
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("script-src 'self' 'unsafe-inline'")
  expect(errors).toEqual([])
  mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/dev-report.json',JSON.stringify({checks:['electron-vite dev server and Electron launch','React Fast Refresh preamble permitted only in development','React navigation and local IPC rendered'],errors},null,2))
  console.log('Development server checks passed.')
}catch(error){console.error(logs);throw error}
finally{
  if(browser)await browser.close().catch(()=>{})
  if(pid&&process.platform==='win32')try{execFileSync('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}
  if(child.pid&&process.platform==='win32')try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}
  else child.kill()
}
