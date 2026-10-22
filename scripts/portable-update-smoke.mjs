import { chromium,expect } from '@playwright/test'
import { spawn,spawnSync,execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as createPort } from 'node:net'
import { chmodSync,createReadStream,copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join,resolve } from 'node:path'
import { tmpdir } from 'node:os'
import electron from 'electron'
if(process.platform!=='win32')throw Error('Portable replacement requires Windows')
const version=JSON.parse(readFileSync('package.json','utf8')).version,source=resolve(process.env.POKETOKEN_UPDATE_SOURCE_EXE||`release/PokeToken-Desktop-${version}-win-x64.exe`),target=resolve(process.env.POKETOKEN_UPDATE_TARGET_EXE||'artifacts/update-target/PokeToken-Desktop-9.9.9-win-x64.exe')
if(!existsSync(target))throw Error('Build the isolated 9.9.9 portable test target first (see docs/UPDATES.md)')
const directory=mkdtempSync(join(tmpdir(),'poketoken-update-')),checks=[],errors=[]
mkdirSync('artifacts',{recursive:true})
let serving=target,corrupt=false,browser,mainPid,child,page,activeData,port,feed
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex')
const server=createServer((req,res)=>{if(req.url!=='/update.exe'){res.writeHead(404);res.end();return}if(corrupt){res.end(Buffer.from('MZbroken download'));return}createReadStream(serving).pipe(res)})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const download=`http://127.0.0.1:${server.address().port}/update.exe`
async function freePort(){const listener=createPort();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const value=listener.address().port;await new Promise(resolve=>listener.close(resolve));return value}
function stop(){if(mainPid&&browser?.isConnected())try{execFileSync('taskkill',['/PID',String(mainPid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}mainPid=null;browser=null}
async function attach(){
 await expect.poll(async()=>{try{return(await fetch(`http://127.0.0.1:${port}/json/version`)).ok}catch{return false}},{timeout:90_000}).toBe(true)
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
 mainPid=(await(await browser.newBrowserCDPSession()).send('SystemInfo.getProcessInfo')).processInfo.find(p=>p.type==='browser').id
 await expect.poll(()=>browser.contexts()[0].pages().some(p=>p.url().includes('view=dashboard')),{timeout:30_000}).toBe(true)
 page=browser.contexts()[0].pages().find(p=>p.url().includes('view=dashboard'));page.on('pageerror',error=>errors.push(error.message))
 await expect.poll(async()=>Boolean((await page.evaluate(()=>window.desktop.getSnapshot())).lastScan),{timeout:30_000}).toBe(true)
}
async function launch(caseName){
 console.log(`portable updater: starting ${caseName}`)
 const folder=join(directory,`${caseName} 한글 [portable] O'Brien & space`);mkdirSync(folder)
 const executable=join(folder,'나의 PokeToken.exe');copyFileSync(source,executable);activeData=join(folder,'data');feed=join(folder,'releases.json');port=await freePort()
 const name='PokeToken-Desktop-9.9.9-win-x64.exe';writeFileSync(feed,JSON.stringify([{tag_name:'v9.9.9',assets:[{name,digest:`sha256:${sha(serving)}`,size:readFileSync(serving).length,browser_download_url:`https://github.com/KHLEE72/pokeTokenDesktop/releases/download/v9.9.9/${name}`}]}]))
 const env={...process.env,POKETOKEN_DATA_DIR:activeData,POKETOKEN_TEST_MODE:'1',POKETOKEN_UPDATE_FIXTURE:feed,POKETOKEN_UPDATE_TEST_DOWNLOAD:download};delete env.ELECTRON_RUN_AS_NODE
 const start=async()=>{child=spawn(executable,[`--remote-debugging-port=${port}`],{env,windowsHide:true,stdio:'ignore'});await attach()}
 await start();await page.evaluate(()=>window.desktop.updateSettings({language:'ko',theme:'dark',paused:true}))
 const game=(await page.evaluate(()=>window.desktop.getSnapshot())).game;game.candyTokens=12_345_678;game.tokensEarned=34_567_890;game.owned=Array.from({length:1025},(_,i)=>i+1);game.appearances.owned=[10034];game.appearances.megaStones=['charizardite-x'];game.appearances.freeMegaStoneUsed=true
 const fixture=join(folder,'game.json');writeFileSync(fixture,JSON.stringify(game));stop()
 await expect.poll(()=>{try{process.kill(child.pid,0);return false}catch{return true}},{timeout:30_000}).toBe(true)
 expect(spawnSync(electron,['scripts/collection-fixture.cjs',join(activeData,'poketoken.sqlite'),fixture],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:'inherit'}).status).toBe(0)
 await start();await page.evaluate(()=>window.desktop.setLeagueDisplay({badges:['rgb-boulder','yellow-cascade'],title:'bdsp-champion'}))
 const saved=await page.evaluate(()=>window.desktop.getSnapshot())
 await page.locator('.sidebar-update').click();await expect(page.locator('.update-dialog')).toContainText('9.9.9');expect((await page.evaluate(()=>window.desktop.getUpdateState())).mode).toBe('portable')
 console.log(`portable updater: ${caseName} ready`)
 return {executable,saved,hash:sha(executable)}
}
async function applyUpdate(){
 await page.evaluate(()=>{globalThis.__updateClicks=[];document.querySelector('.update-dialog .primary').addEventListener('click',event=>globalThis.__updateClicks.push({trusted:event.isTrusted,target:event.target.textContent}),{once:true})})
 await page.getByRole('button',{name:'업데이트하고 재시작',exact:true}).click()
 console.log('portable updater: apply click',await page.evaluate(()=>({clicks:globalThis.__updateClicks})))
 await expect.poll(()=>page.evaluate(()=>window.desktop.getUpdateState()).then(s=>s.status).catch(()=>page.isClosed()?'closing':'available'),{timeout:3000}).not.toBe('available')
}
function receipt(){const root=join(activeData,'portable-updates');if(!existsSync(root))return null;for(const folder of readdirSync(root)){const status=join(root,folder,'status.json');if(existsSync(status)){try{return {...JSON.parse(readFileSync(status,'utf8')),directory:join(root,folder)}}catch{}}}return null}
function expectSaved(after,before){for(const key of ['game','league','rewards'])expect(after[key]).toEqual(before[key]);for(const key of ['language','theme','paused','roots'])expect(after.settings[key]).toEqual(before.settings[key])}
try{
 const successful=await launch('success');await page.screenshot({path:'artifacts/portable-update-dialog.png'});await applyUpdate()
 await expect.poll(async()=>{const state=receipt();if(['failed','rolled-back','recovery-required'].includes(state?.status))throw Error(`Unexpected replacement status: ${JSON.stringify(state)}`);if(!state&&!page.isClosed()){const update=await page.evaluate(()=>window.desktop.getUpdateState()).catch(()=>null);if(update?.status==='error')throw Error(update.error)}return state?.status},{timeout:150_000}).toBe('complete');browser=null;mainPid=null;await attach()
 expect((await page.evaluate(()=>window.desktop.getUpdateState())).currentVersion).toBe('9.9.9');expect(sha(successful.executable)).toBe(sha(target));expectSaved(await page.evaluate(()=>window.desktop.getSnapshot()),successful.saved)
 expect(readdirSync(receipt().directory)).not.toContain('download.exe');expect(readdirSync(join(successful.executable,'..')).some(n=>n.includes('.backup-'))).toBe(false)
 checks.push('the actual portable launcher downloads a SHA-256 verified EXE, exits, replaces its own renamed EXE after the launcher unlocks, restarts and confirms healthy startup; Unicode, spaces, apostrophe, brackets and ampersand paths work')
 checks.push('SQLite game, candy, growth, Mega unlocks, league display, achievements, language, theme and configured log roots survive the real replacement; successful backup and download are cleaned')
 await page.screenshot({path:'artifacts/portable-update-complete.png'});stop()
 corrupt=true;const broken=await launch('corrupt');await applyUpdate();await expect(page.locator('.update-dialog [role="status"]')).toContainText('손상');expect(sha(broken.executable)).toBe(broken.hash);expectSaved(await page.evaluate(()=>window.desktop.getSnapshot()),broken.saved)
 checks.push('a truncated/corrupt download leaves the running app, original EXE and saved progress intact and reports a localized error');stop();corrupt=false
 const stub=join(directory,'exits.exe'),cs=join(directory,'exits.cs');writeFileSync(cs,'class Program { static int Main() { return 1; } }')
 const compile=spawnSync(join(process.env.SystemRoot,'Microsoft.NET','Framework64','v4.0.30319','csc.exe'),['/nologo','/target:winexe',`/out:${stub}`,cs],{windowsHide:true,encoding:'utf8'});if(compile.status!==0)throw Error(compile.stdout+compile.stderr)
 serving=stub;const rollback=await launch('rollback');await applyUpdate();await expect.poll(()=>receipt()?.status,{timeout:150_000}).toBe('rolled-back');browser=null;mainPid=null;await attach()
 expect(sha(rollback.executable)).toBe(rollback.hash);expectSaved(await page.evaluate(()=>window.desktop.getSnapshot()),rollback.saved);expect((await page.evaluate(()=>window.desktop.getUpdateState())).currentVersion).toBe(version)
 expect((await page.evaluate(()=>window.desktop.getUpdateState())).error).toContain('이전 버전으로 복구')
 await expect(page.locator('.update-dialog [role="status"]')).toContainText('이전 버전으로 복구')
 checks.push('a valid-hash executable that exits before healthy startup is atomically rolled back; the original portable app restarts with progress intact and explains recovery')
 stop();const readOnly=await launch('readonly');chmodSync(readOnly.executable,0o444)
 try{await applyUpdate();await expect(page.locator('.update-dialog [role="status"]')).toContainText('쓸 수 없어요');expect(sha(readOnly.executable)).toBe(readOnly.hash);expectSaved(await page.evaluate(()=>window.desktop.getSnapshot()),readOnly.saved)}finally{chmodSync(readOnly.executable,0o666)}
 checks.push('a read-only original EXE is rejected before quitting; the live app and its progress remain intact')
 expect(errors).toEqual([])
 writeFileSync('artifacts/portable-update-report.json',JSON.stringify({version,directory,source,target,checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2))
}catch(error){await page?.screenshot({path:'artifacts/portable-update-failure.png'}).catch(()=>{});writeFileSync('artifacts/portable-update-failure.json',JSON.stringify({directory,receipt:receipt(),checks,errors,error:String(error)},null,2));throw error}
finally{stop();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
