import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
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
  private upgrading = new Map<string, Promise<void>>()
  private retryAfter = new Map<string, number>()
  private active = 0
  private waiting: (() => void)[] = []
  constructor(private directory: string, private download = downloadSprite, private bundledDirectory?: string) {}
  async get(id: number, shiny = false): Promise<string | null> {
    if (!spriteSources(id, shiny).length) return null
    const key = `${id}:${shiny}`
    if (this.pending.has(key)) return this.pending.get(key)!
    const task = this.load(id,shiny,key).finally(() => this.pending.delete(key))
    this.pending.set(key, task)
    return task
  }
  private async request(url: string): Promise<Buffer> {
    if (url.startsWith('bundled:')) {
      const filename = url.slice('bundled:'.length)
      if (!this.bundledDirectory || !/^\d+(?:-shiny)?\.gif$/.test(filename)) throw new Error('bundle')
      return readFile(join(this.bundledDirectory, filename))
    }
    if (this.active < 4) this.active++; else await new Promise<void>(resolve => this.waiting.push(resolve))
    try { return await this.download(url) }
    finally { const next = this.waiting.shift(); if (next) next(); else this.active-- }
  }
  private async store(filename: string, bytes: Buffer): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const temporary = join(this.directory, `${filename}.${process.pid}.tmp`)
    try { await writeFile(temporary, bytes); await rename(temporary, join(this.directory, filename)) }
    finally { await rm(temporary, { force: true }).catch(() => {}) }
  }
  private async load(id: number, shiny: boolean, key: string): Promise<string | null> {
    const stem = `${id}${shiny ? '-shiny' : ''}`
    const uri = (bytes: Buffer): string => `data:image/${spriteFormat(bytes)};base64,${bytes.toString('base64')}`
    const sources = spriteSources(id, shiny)
    // Bundled atlas conversions work immediately even with an older PNG cache or no internet.
    if (this.bundledDirectory) for (const source of sources.filter(s => s.url.startsWith('bundled:'))) {
      try { const bytes = await this.request(source.url); if (spriteFormat(bytes) === source.format) return uri(bytes) } catch { /* Retain cache/network alternatives. */ }
    }
    // Serve existing images immediately, upgrading old PNGs without blocking offline use.
    for (const format of ['gif', 'png'] as const) {
      try {
        const bytes = await readFile(join(this.directory, `${stem}.${format}`))
        if (spriteFormat(bytes) === format) {
          if (format === 'png') this.upgradeAnimation(id, shiny, key, stem)
          return uri(bytes)
        }
      } catch { /* first download */ }
    }
    if (Date.now() < (this.retryAfter.get(key) ?? 0)) return null
    for (const source of sources) {
      try {
        const bytes = await this.request(source.url)
        if (spriteFormat(bytes) !== source.format) throw new Error('format')
        await this.store(`${stem}.${source.format}`, bytes)
        if (source.format === 'png' && sources.some(s => s.format === 'gif')) this.retryAfter.set(key, Date.now() + 60_000)
        return uri(bytes)
      } catch { /* Try the known PNG alternative after a missing/broken GIF. */ }
    }
    this.retryAfter.set(key, Date.now() + 60_000)
    return null
  }
  private upgradeAnimation(id: number, shiny: boolean, key: string, stem: string): void {
    const sources = spriteSources(id, shiny).filter(s => s.format === 'gif')
    if (!sources.length || this.upgrading.has(key) || Date.now() < (this.retryAfter.get(key) ?? 0)) return
    const task = (async(): Promise<void> => {
      for (const source of sources) {
        try {
          const bytes = await this.request(source.url)
          if (spriteFormat(bytes) !== 'gif') throw new Error('format')
          await this.store(`${stem}.gif`, bytes)
          this.retryAfter.delete(key)
          return
        } catch { /* Retain the offline PNG and retry animation later. */ }
      }
      this.retryAfter.set(key, Date.now() + 60_000)
    })().finally(() => this.upgrading.delete(key))
    this.upgrading.set(key, task)
  }
}
