import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { get } from 'node:https'
import { POKEMON } from '../shared/model'
export class SpriteCache {
  private pending = new Map<string, Promise<string | null>>()
  private retryAfter = new Map<string, number>()
  constructor(private directory: string) {}
  async get(id: number, shiny = false): Promise<string | null> {
    if (!Number.isInteger(id) || !POKEMON.some(p=>p.id===id)) return null
    const key = `${id}:${shiny}`
    if (this.pending.has(key)) return this.pending.get(key)!
    const task = this.load(id,shiny,key).finally(() => this.pending.delete(key))
    this.pending.set(key, task)
    return task
  }
  private async load(id: number, shiny: boolean, key: string): Promise<string | null> {
    const path = join(this.directory, `${id}${shiny ? '-shiny' : ''}.gif`)
    const valid = (b: Buffer): boolean => b.length < 2 * 1024 * 1024 && b.subarray(0, 3).toString() === 'GIF'
    const uri = (b: Buffer): string => `data:image/gif;base64,${b.toString('base64')}`
    try { const cached = await readFile(path); if (valid(cached)) return uri(cached) } catch { /* first download */ }
    if (Date.now() < (this.retryAfter.get(key) ?? 0)) return null
    try {
      const data = await new Promise<Buffer>((resolve, reject) => {
        const request = get(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${shiny ? 'shiny/' : ''}${id}.gif`, response => {
          if (response.statusCode !== 200) { response.resume(); reject(new Error('status')); return }
          const chunks: Buffer[] = []; let size = 0
          response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 2 * 1024 * 1024) request.destroy(new Error('size')); else chunks.push(chunk) })
          response.on('end', () => resolve(Buffer.concat(chunks)))
          response.on('error', reject)
        })
        request.setTimeout(10_000, () => request.destroy(new Error('timeout')))
        request.on('error', reject)
      })
      if (!valid(data)) throw new Error('format')
      await mkdir(this.directory, { recursive: true }); await writeFile(path, data)
      return uri(data)
    } catch { this.retryAfter.set(key, Date.now() + 60_000); return null }
  }
}
