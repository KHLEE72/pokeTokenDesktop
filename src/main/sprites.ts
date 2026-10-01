import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { get } from 'node:https'
export class SpriteCache {
  private pending = new Map<number, Promise<string | null>>()
  private retryAfter = new Map<number, number>()
  constructor(private directory: string) {}
  async get(id: number): Promise<string | null> {
    if (!Number.isInteger(id) || id < 1 || id > 9) return null
    if (this.pending.has(id)) return this.pending.get(id)!
    const task = this.load(id).finally(() => this.pending.delete(id))
    this.pending.set(id, task)
    return task
  }
  private async load(id: number): Promise<string | null> {
    const path = join(this.directory, `${id}.gif`)
    const valid = (b: Buffer): boolean => b.length < 2 * 1024 * 1024 && b.subarray(0, 3).toString() === 'GIF'
    const uri = (b: Buffer): string => `data:image/gif;base64,${b.toString('base64')}`
    try { const cached = await readFile(path); if (valid(cached)) return uri(cached) } catch { /* first download */ }
    if (Date.now() < (this.retryAfter.get(id) ?? 0)) return null
    try {
      const data = await new Promise<Buffer>((resolve, reject) => {
        const request = get(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${id}.gif`, response => {
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
    } catch { this.retryAfter.set(id, Date.now() + 60_000); return null }
  }
}
