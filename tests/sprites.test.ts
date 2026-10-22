import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { SpriteCache } from '../src/main/sprites'
import { spriteFormat, spriteSources, usesArtwork } from '../src/shared/sprites'
import { ALL_POKEMON, POKEMON } from '../src/shared/catalog'
import { removeTestDirectory } from './temp'
import extra from '../src/shared/extra-sprite-catalog.json'

const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64')
const png=readFileSync('src/renderer/src/assets/rare-candy.png')
const directories:string[]=[]
const directory=()=>{const dir=mkdtempSync(join(tmpdir(),'poketoken-sprites-'));directories.push(dir);return dir}
afterEach(()=>{vi.useRealTimers();for(const dir of directories.splice(0))removeTestDirectory(dir)})

describe('full-roster sprite sources and offline cache',()=>{
  it('has a pinned normal and shiny source for every species with pixel PNG fallbacks',()=>{
    for(const p of POKEMON)for(const shiny of [false,true]){
      const sources=spriteSources(p.id,shiny)
      expect(sources.length).toBeGreaterThan(0)
      const supplement=extra.pokemon.find(e=>e.id===p.id)?.[shiny?'shiny':'normal']
      expect(sources.every(s=>s.url.includes('/ba403973fdf9d0ac59175813861e6a1f8ed5020c/')||s.url===supplement?.url)).toBe(true)
      expect(sources.at(-1)?.format).toBe('png')
      expect(sources.filter(s=>s.url.includes('/PokeAPI/')).every(s=>s.url.includes('/shiny/')===shiny)).toBe(true)
    }
    expect(spriteSources(1).map(s=>s.format)).toEqual(['gif','png'])
    expect(spriteSources(906).map(s=>s.format)).toEqual(['gif','png'])
    for(const id of [0,1026,NaN,1.5])expect(spriteSources(id)).toEqual([])
  })
  it('covers every static appearance with credited pixel animation except the three indistinguishable shiny Mega strips',()=>{
    expect(extra.pokemon).toHaveLength(255)
    expect(new Set(extra.pokemon.map(p=>p.id)).size).toBe(255)
    let variants=0
    for(const p of extra.pokemon)for(const variant of ['normal','shiny'] as const){
      const animation=p[variant]
      expect(p.credits.length).toBeGreaterThan(0)
      if(!animation)continue
      variants++
      expect(animation.frames).toBeGreaterThan(1);expect(animation.uniqueFrames).toBeGreaterThan(1)
      expect(animation.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(animation.url).not.toContain('/other/showdown/')
      expect(spriteSources(p.id,variant==='shiny')[0]).toEqual({url:animation.url,format:'gif'})
    }
    expect(variants).toBe(504)
    for(const shiny of [false,true])expect(ALL_POKEMON.filter(p=>spriteSources(p.id,shiny)[0].format==='png').map(p=>p.id)).toEqual(shiny?[10282,10283,10298]:[])
    expect(spriteSources(1)[0].url).toContain('/black-white/animated/')
    expect(spriteSources(701)[0].url).toBe('bundled:701.gif')
    expect(spriteSources(940)[0].url).toBe('bundled:940.gif')
    for(const p of extra.pokemon)if(p.normal&&p.shiny)expect(p.normal.sha256).not.toBe(p.shiny.sha256)
    // Keep the original artwork as a fallback; the renderer draws the new GIF as pixels.
    expect(usesArtwork(10301)).toBe(true);expect(spriteSources(10301)[0].format).toBe('gif')
  })
  it('validates all bundled normal/shiny GIF hashes and uses them offline ahead of existing PNG/GIF caches',async()=>{
    const dir=directory(),download=vi.fn(async()=>{throw Error('offline')})
    const cache=new SpriteCache(dir,download,join(process.cwd(),'src/renderer/public/sprites'))
    let variants=0
    for(const p of extra.pokemon)for(const shiny of [false,true]){
      const metadata=p[shiny?'shiny':'normal']
      if(!metadata?.url.startsWith('bundled:'))continue
      variants++
      const filename=`${p.id}${shiny?'-shiny':''}`
      writeFileSync(join(dir,`${filename}.png`),png);writeFileSync(join(dir,`${filename}.gif`),gif)
      const bytes=readFileSync(`src/renderer/public/sprites/${filename}.gif`)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(metadata.sha256)
      expect(spriteFormat(bytes)).toBe('gif')
      expect(await cache.get(p.id,shiny)).toBe(`data:image/gif;base64,${bytes.toString('base64')}`)
      expect(readFileSync(join(dir,`${filename}.png`))).toEqual(png)
      expect(readFileSync(join(dir,`${filename}.gif`))).toEqual(gif)
    }
    expect(variants).toBe(432)
    expect(download).not.toHaveBeenCalled()
  },15000)
  it('preserves the three existing shiny PNGs and maps regional, gender and Mega branches to their actual source forms',async()=>{
    const dir=directory(),download=vi.fn(async()=>{throw Error('offline')})
    const cache=new SpriteCache(dir,download,join(process.cwd(),'src/renderer/public/sprites'))
    for(const id of [10282,10283,10298]){
      writeFileSync(join(dir,`${id}-shiny.png`),png)
      expect(spriteSources(id,true).map(s=>s.format)).toEqual(['png'])
      expect(await cache.get(id,true)).toBe(`data:image/png;base64,${png.toString('base64')}`)
      expect(await cache.get(id)).toMatch(/^data:image\/gif;/)
    }
    expect(download).not.toHaveBeenCalled()
    for(const [id,file] of [[10176,'DARUMAKA_2.png'],[10294,'GRENINJA_3.png'],[10071,'SLOWBRO_2.png'],[10301,'ZYGARDE_4.png'],[10314,'MEOWSTIC_2.png'],[10326,'MEOWSTIC_3.png'],[10322,'TATSUGIRI_3.png'],[10323,'TATSUGIRI_4.png'],[10324,'TATSUGIRI_5.png']] as const){
      const metadata=extra.pokemon.find(p=>p.id===id)!.normal!
      expect('originalPng' in metadata&&metadata.originalPng?.url.endsWith('/'+file)).toBe(true)
    }
    for(const id of [652,715,870]){
      expect(spriteSources(id)[0].url).toContain('/black-white/animated/')
      expect(spriteSources(id,true)[0].url).toBe(`bundled:${id}-shiny.gif`)
    }
  })
  it('preserves old GIFs and new shiny PNGs without any connection',async()=>{
    const dir=directory();writeFileSync(join(dir,'1.gif'),gif);writeFileSync(join(dir,'906-shiny.png'),png)
    const download=vi.fn(async()=>{throw Error('offline')})
    const cache=new SpriteCache(dir,download)
    expect(await cache.get(1)).toBe(`data:image/gif;base64,${gif.toString('base64')}`)
    expect(await cache.get(906,true)).toBe(`data:image/png;base64,${png.toString('base64')}`)
    expect(download).not.toHaveBeenCalled()
  })
  it('deduplicates requests and caches a validated PNG when a GIF fails',async()=>{
    const dir=directory(),download=vi.fn(async(url:string)=>{if(url.endsWith('.gif'))throw Error('missing');return png})
    const cache=new SpriteCache(dir,download),results=await Promise.all([cache.get(1,true),cache.get(1,true)])
    expect(results[0]).toBe(results[1]);expect(results[0]).toContain('data:image/png;')
    expect(download).toHaveBeenCalledTimes(2);expect(readFileSync(join(dir,'1-shiny.png'))).toEqual(png)
    expect(await new SpriteCache(dir,async()=>{throw Error('offline')}).get(1,true)).toBe(results[0])
  })
  it('serves an old PNG immediately while one background request upgrades it to a cached animation',async()=>{
    const dir=directory();writeFileSync(join(dir,'1-shiny.png'),png)
    let finish!:(bytes:Buffer)=>void
    const download=vi.fn(()=>new Promise<Buffer>(resolve=>{finish=resolve})),cache=new SpriteCache(dir,download)
    const fallback=`data:image/png;base64,${png.toString('base64')}`
    expect(await cache.get(1,true)).toBe(fallback)
    expect(await cache.get(1,true)).toBe(fallback)
    expect(download).toHaveBeenCalledTimes(1)
    finish(gif)
    await vi.waitFor(()=>expect(readFileSync(join(dir,'1-shiny.gif'))).toEqual(gif))
    expect(await cache.get(1,true)).toContain('data:image/gif;')
    expect(readFileSync(join(dir,'1-shiny.png'))).toEqual(png)
    expect(await new SpriteCache(dir,async()=>{throw Error('offline')}).get(1,true)).toContain('data:image/gif;')
  })
  it('retains cached PNGs through failed upgrades and retries animation only after the cooldown',async()=>{
    vi.useFakeTimers();const dir=directory();writeFileSync(join(dir,'1.png'),png)
    const download=vi.fn(async()=>{throw Error('offline')}),cache=new SpriteCache(dir,download)
    expect(await cache.get(1)).toContain('data:image/png;')
    expect(await cache.get(1)).toContain('data:image/png;')
    expect(download).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60_001)
    expect(await cache.get(1)).toContain('data:image/png;')
    expect(download).toHaveBeenCalledTimes(2)
    expect(readFileSync(join(dir,'1.png'))).toEqual(png)
  })
  it('rejects corrupt and oversized responses, retries after cooldown and never substitutes normal for shiny',async()=>{
    vi.useFakeTimers();const dir=directory();writeFileSync(join(dir,'906.png'),png)
    const download=vi.fn(async()=>Buffer.from('not an image'))
    const cache=new SpriteCache(dir,download)
    expect(await cache.get(906,true)).toBeNull();expect(await cache.get(906,true)).toBeNull();expect(download).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60_001);download.mockResolvedValue(png)
    expect(await cache.get(906,true)).toContain('data:image/png;');expect(download).toHaveBeenCalledTimes(2)
    expect(spriteFormat(Buffer.from('GIF89a'))).toBeNull()
    expect(spriteFormat(Buffer.alloc(2*1024*1024))).toBeNull()
    expect(await cache.get(1026)).toBeNull()
  })
  it('limits parallel network downloads to four and releases slots after failures',async()=>{
    let active=0,maximum=0
    const cache=new SpriteCache(directory(),async(url)=>{
      maximum=Math.max(maximum,++active)
      await new Promise(resolve=>setTimeout(resolve,5));active--
      if(url.endsWith('.gif'))throw Error('retry as PNG')
      return png
    })
    const images=await Promise.all(Array.from({length:12},(_,i)=>cache.get(i+1)))
    expect(maximum).toBe(4);expect(active).toBe(0)
    expect(images.every(image=>image?.startsWith('data:image/png;'))).toBe(true)
  })
})
