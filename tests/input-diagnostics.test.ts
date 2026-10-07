import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { InputDiagnostics, sanitizeNativePetInput, sanitizePetTrace } from '../src/main/input-diagnostics'

describe('bounded local pet input diagnostics',()=>{
  it('accepts only supported input metadata and discards text, paths and malformed values',()=>{
    expect(sanitizePetTrace({event:'handler.down',pointerId:1,buttons:1,pressed:true,motion:'held',error:'NotFoundError',prompt:'private',token:'secret',path:'/private',x:Infinity,y:2_000_000,button:'left',captured:'yes'})).toEqual({event:'handler.down',pointerId:1,buttons:1,pressed:true,motion:'held',error:'NotFoundError'})
    expect(sanitizePetTrace({event:'arbitrary.private-text'})).toBeNull()
    expect(sanitizePetTrace(null)).toBeNull()
    expect(sanitizeNativePetInput({overWindow:true,leftDown:false,clickThrough:false,dpi:144,x:12,windowTitle:'private',handle:'other-app',y:Infinity})).toEqual({overWindow:true,leftDown:false,clickThrough:false,dpi:144,x:12})
    expect(sanitizeNativePetInput({overWindow:'true',leftDown:true})).toBeNull()
  })
  it('persists session/sequence ordering through concurrent flushes and restart',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'poketoken-diagnostic-test-')),log=new InputDiagnostics(directory)
    log.record('start');const first=log.flush();log.record('click',{button:0});const second=log.flush()
    await Promise.all([first,second]);await log.close()
    const next=new InputDiagnostics(directory);next.record('start');await next.close()
    const rows=(await readFile(log.path,'utf8')).trim().split('\n').map(line=>JSON.parse(line))
    expect(rows.map(row=>row.event)).toEqual(['start','click','start'])
    expect(rows.map(row=>row.seq)).toEqual([1,2,1])
    expect(rows[0].session).toBe(rows[1].session);expect(rows[0].session).not.toBe(rows[2].session)
    expect(rows[1].ms).toBeGreaterThanOrEqual(rows[0].ms)
  })
  it('rotates to three bounded files while retaining the newest events',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'poketoken-diagnostic-test-')),log=new InputDiagnostics(directory,1024)
    for(let index=0;index<50;index++){log.record('click',{index});await log.flush()}
    await log.close()
    const files=await readdir(directory)
    expect(files.sort()).toEqual(['pet-input.jsonl','pet-input.jsonl.1','pet-input.jsonl.2'])
    for(const name of files)expect((await stat(join(directory,name))).size).toBeLessThanOrEqual(1024)
    const current=(await readFile(log.path,'utf8')).trim().split('\n').map(line=>JSON.parse(line))
    expect(current.at(-1).data.index).toBe(49)
  })
  it('contains filesystem failures so they cannot interrupt interaction',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'poketoken-diagnostic-test-')),blocker=join(directory,'file')
    await writeFile(blocker,'not a directory')
    const log=new InputDiagnostics(join(blocker,'diagnostics'))
    log.record('click');await expect(log.flush()).resolves.toBeUndefined()
    expect(()=>log.record('another-click')).not.toThrow();await expect(log.close()).resolves.toBeUndefined()
  })
  it('bounds a burst and reports dropped records without breaking session ordering',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'poketoken-diagnostic-test-')),log=new InputDiagnostics(directory)
    const circular:Record<string,unknown>={};circular.self=circular
    expect(()=>log.record('invalid',circular)).not.toThrow()
    for(let index=0;index<510;index++)log.record('click',{index})
    await log.close()
    const rows=(await readFile(log.path,'utf8')).trim().split('\n').map(line=>JSON.parse(line))
    expect(rows).toHaveLength(501);expect(rows.at(-1).event).toBe('diagnostic.dropped');expect(rows.at(-1).data.count).toBe(11)
    expect(rows.every((row,index,list)=>row.session===rows[0].session&&(!index||row.seq>list[index-1].seq))).toBe(true)
  })
})
