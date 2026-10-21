import { createServer } from 'node:http'
import { createHash,randomBytes } from 'node:crypto'
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
if(!process.versions.electron){const env={...process.env,POKETOKEN_TEST_MODE:'1'};delete env.ELECTRON_RUN_AS_NODE;const child=spawnSync(require('electron'),[fileURLToPath(import.meta.url)],{env,windowsHide:true,stdio:'inherit'});process.exit(child.status??1)}
const {NsisUpdater}=require('electron-updater'),{ElectronHttpExecutor}=require('electron-updater/out/electronHttpExecutor'),{app}=require('electron')
const directory=mkdtempSync(join(tmpdir(),'poketoken-updater-http-')),checks=[],errors=[],body=randomBytes(96*1024),sha512=createHash('sha512').update(body).digest('base64')
app.setPath('userData',directory);process.env.POKETOKEN_DATA_DIR=directory
void app.whenReady().then(async()=>{
let corrupt=false,fail=false,downloads=0
const server=createServer((req,res)=>{
 if(fail){res.writeHead(503);res.end();return}
 if(req.url.startsWith('/latest.yml')){res.setHeader('Content-Type','text/yaml');res.end(`version: 9.9.9\nfiles:\n  - url: test-setup.exe\n    sha512: ${sha512}\n    size: ${body.length}\npath: test-setup.exe\nsha512: ${sha512}\nreleaseDate: 2026-10-21T00:00:00.000Z\n`);return}
 if(req.url.startsWith('/test-setup.exe')){downloads++;res.setHeader('Content-Length',body.length);res.end(corrupt?Buffer.alloc(body.length,0):body);return}
 res.writeHead(404);res.end()
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`
let attempts=0
function updater(){
 const data=join(directory,String(attempts++));mkdirSync(data);const config=join(data,'app-update.yml');writeFileSync(config,`provider: generic\nurl: ${url}\nupdaterCacheDirName: cache\n`)
 const adapter={version:'1.0.0',name:'PokeToken updater test',isPackaged:true,appUpdateConfigPath:config,userDataPath:data,baseCachePath:data,whenReady:async()=>{},onQuit:()=>{},quit:()=>{throw Error('Test must never quit/install')},relaunch:()=>{throw Error('Test must never relaunch')}}
 const client=new NsisUpdater(null,adapter);client.httpExecutor=new ElectronHttpExecutor((_auth,callback)=>callback());client.setFeedURL({provider:'generic',url});client.logger=null;client.autoDownload=false;client.autoInstallOnAppQuit=false;client.disableDifferentialDownload=true;client.disableWebInstaller=true;client.on('error',()=>{})
 return client
}
try{
 const client=updater(),result=await client.checkForUpdates();assert.equal(result.isUpdateAvailable,true);assert.equal(result.updateInfo.version,'9.9.9');assert.equal(downloads,0)
 checks.push('the real NsisUpdater reads loopback update metadata and reports a newer version without downloading or installing')
 const paths=await client.downloadUpdate();assert.equal(paths.length,1);assert.deepEqual(readFileSync(paths[0]),body);assert.equal(downloads,1)
 await client.downloadUpdate();assert.equal(downloads,1)
 checks.push('explicit download verifies SHA-512 bytes, stores them only in the temporary cache and reuses the verified completed download')
 corrupt=true;const broken=updater();await broken.checkForUpdates();await assert.rejects(broken.downloadUpdate(),/checksum|sha512/i)
 checks.push('a corrupted update is rejected on checksum mismatch and never executed')
 fail=true;await assert.rejects(updater().checkForUpdates());checks.push('an unavailable feed rejects cleanly and cannot trigger an installation')
 mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/updater-download-report.json',JSON.stringify({directory,checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2))
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));app.quit()}
}).catch(error=>{console.error(error);app.exit(1)})
