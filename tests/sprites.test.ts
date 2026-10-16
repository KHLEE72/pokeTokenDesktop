import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SpriteCache } from '../src/main/sprites'
import { spriteFormat, spriteSources } from '../src/shared/sprites'
import { POKEMON } from '../src/shared/catalog'
import { removeTestDirectory } from './temp'

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
      expect(sources.every(s=>s.url.includes('/ba403973fdf9d0ac59175813861e6a1f8ed5020c/'))).toBe(true)
      expect(sources.at(-1)?.format).toBe('png')
      expect(sources.every(s=>s.url.includes('/shiny/')===shiny)).toBe(true)
    }
    expect(spriteSources(1).map(s=>s.format)).toEqual(['gif','png'])
    expect(spriteSources(906).map(s=>s.format)).toEqual(['png'])
    for(const id of [0,1026,NaN,1.5])expect(spriteSources(id)).toEqual([])
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
