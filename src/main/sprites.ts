import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { get } from 'node:https'
import { spriteFormat, spriteSources } from '../shared/sprites'

function downloadSprite(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = get(url, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('status')); return }
      const chunks: Buffer[] = []; let size = 0
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size >= 2 * 1024 * 1024) request.destroy(new Error('size')); else chunks.push(chunk) })
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    })
    request.setTimeout(10_000, () => request.destroy(new Error('timeout')))
    request.on('error', reject)
  })
}
export class SpriteCache {
  private pending = new Map<string, Promise<string | null>>()
  private retryAfter = new Map<string, number>()
  private active = 0
  private waiting: (() => void)[] = []
  constructor(private directory: string, private download = downloadSprite) {}
  async get(id: number, shiny = false): Promise<string | null> {
    if (!spriteSources(id, shiny).length) return null
    const key = `${id}:${shiny}`
    if (this.pending.has(key)) return this.pending.get(key)!
    const task = this.load(id,shiny,key).finally(() => this.pending.delete(key))
    this.pending.set(key, task)
    return task
  }
  private async request(url: string): Promise<Buffer> {
    if (this.active < 4) this.active++; else await new Promise<void>(resolve => this.waiting.push(resolve))
    try { return await this.download(url) }
    finally { const next = this.waiting.shift(); if (next) next(); else this.active-- }
  }
  private async load(id: number, shiny: boolean, key: string): Promise<string | null> {
    const stem = `${id}${shiny ? '-shiny' : ''}`
    const uri = (bytes: Buffer): string => `data:image/${spriteFormat(bytes)};base64,${bytes.toString('base64')}`
    // Retain the existing GIF cache and read either format without a network.
    for (const format of ['gif', 'png'] as const) {
      try { const bytes = await readFile(join(this.directory, `${stem}.${format}`)); if (spriteFormat(bytes) === format) return uri(bytes) } catch { /* first download */ }
    }
    if (Date.now() < (this.retryAfter.get(key) ?? 0)) return null
    for (const source of spriteSources(id, shiny)) {
      try {
        const bytes = await this.request(source.url)
        if (spriteFormat(bytes) !== source.format) throw new Error('format')
        await mkdir(this.directory, { recursive: true })
        await writeFile(join(this.directory, `${stem}.${source.format}`), bytes)
        return uri(bytes)
      } catch { /* Try the known PNG alternative after a missing/broken GIF. */ }
    }
    this.retryAfter.set(key, Date.now() + 60_000)
    return null
  }
}
