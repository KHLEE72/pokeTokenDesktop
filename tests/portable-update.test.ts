import { describe,it,expect,vi } from 'vitest'
import { mkdtemp,mkdir,readFile,writeFile,readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash,randomUUID } from 'node:crypto'
import { PortableUpdateBackend,acknowledgePortableUpdate,portableHelperCommand } from '../src/main/portable-update'

const body=Buffer.from('MZ a test executable payload'),sha256=createHash('sha256').update(body).digest('hex')
async function setup(payload:Buffer=body,size=body.length,sha=sha256){
 const root=await mkdtemp(join(tmpdir(),'poketoken-portable-unit-')),quit=vi.fn(),fetcher=vi.fn(async()=>new Response(new Uint8Array(payload)))
 const backend=new PortableUpdateBackend({root,executable:join(root,'app.exe'),version:'1.0.0',helper:join(root,'missing.ps1'),latest:async()=>({version:'2.0.0',url:'https://example.test/download',sha256:sha,size}),fetch:fetcher,quit})
 await backend.check();return {root,quit,fetcher,backend}
}
describe('portable download and startup receipt',()=>{
 it('quotes literal paths for the hidden independent PowerShell launch',()=>{
  const root="C:\\test [app] O'Brien & space",command=portableHelperCommand('C:\\Windows\\powershell.exe',`${root}\\helper.ps1`,`${root}\\config.json`,root)
  expect(command).toContain("O''Brien & space");expect(command).toContain('ProcessWindowStyle]::Hidden');expect(command).toContain('UseShellExecute=$true');expect(command).toContain(`-File "${root.replaceAll("'","''")}\\helper.ps1"`)
 })
 it('streams verified bytes, reports progress and reuses a completed verified download',async()=>{
  const {backend,root,fetcher}=await setup(),progress:number[]=[]
  await backend.download(value=>progress.push(value));await backend.download(()=>{})
  expect(fetcher).toHaveBeenCalledTimes(1);expect(progress.at(-1)).toBe(100)
  const directory=(await readdir(root))[0];expect(await readFile(join(root,directory,'download.exe'))).toEqual(body)
 })
 it('deletes incomplete or corrupt downloads and never quits',async()=>{
  for(const [payload,size,sha]of [[body,body.length,'0'.repeat(64)],[body,body.length+1,sha256],[body,body.length-1,sha256],[Buffer.from('not an EXE'),10,createHash('sha256').update('not an EXE').digest('hex')]] as const){
   const {backend,root,quit}=await setup(payload,size,sha)
   await expect(backend.download(()=>{})).rejects.toThrow('손상');expect(await readdir(root)).toEqual([]);expect(quit).not.toHaveBeenCalled()
  }
 })
 it('does not quit when the target or helper cannot be prepared',async()=>{
  const {backend,root,quit}=await setup();await backend.download(()=>{})
  await expect(backend.install()).rejects.toThrow('폴더');expect(quit).not.toHaveBeenCalled()
  await writeFile(join(root,'app.exe'),body);await expect(backend.install()).rejects.toThrow('ENOENT');expect(quit).not.toHaveBeenCalled()
 })
 it('cleans its own partial directory when the download server fails',async()=>{
  const {backend,root,quit,fetcher}=await setup();fetcher.mockRejectedValueOnce(Error('Offline'))
  await expect(backend.download(()=>{})).rejects.toThrow('Offline');expect(await readdir(root)).toEqual([]);expect(quit).not.toHaveBeenCalled()
 })
 it('acknowledges only a matching token, launched version and original EXE path',async()=>{
  const root=await mkdtemp(join(tmpdir(),'poketoken-receipt-')),token=randomUUID(),directory=join(root,token),target=join(root,'앱 with spaces.exe')
  await mkdir(directory);await writeFile(join(directory,'config.json'),JSON.stringify({token,target,version:'2.0.0'}))
  const args=[`--poketoken-update=${token}`]
  await acknowledgePortableUpdate(root,target,'1.0.0',args);expect(await readdir(directory)).toEqual(['config.json'])
  await acknowledgePortableUpdate(root,join(root,'other.exe'),'2.0.0',args);expect(await readdir(directory)).toEqual(['config.json'])
  await acknowledgePortableUpdate(root,target,'2.0.0',args);expect(await readFile(join(directory,'healthy'),'utf8')).toBe(token)
 })
})
