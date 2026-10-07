import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { PetInputTrace, PET_TRACE_EVENTS } from '../shared/model'

// Only these numeric/boolean fields can cross the diagnostic IPC. No arbitrary
// renderer text, document content, paths, keyboard input or tokens are accepted.
const numbers = ['pointerId','button','buttons','x','y','width','height','dpr','line','column'] as const
const flags = ['onCharacter','captured','pressed','trusted','visible','focused'] as const
export function sanitizePetTrace(value: unknown): PetInputTrace | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  if (!PET_TRACE_EVENTS.includes(input.event as PetInputTrace['event'])) return null
  const result: Record<string, unknown> = { event: input.event }
  for (const key of numbers) if (typeof input[key] === 'number' && Number.isFinite(input[key]) && Math.abs(input[key]) <= 1_000_000) result[key] = input[key]
  for (const key of flags) if (typeof input[key] === 'boolean') result[key] = input[key]
  if (['idle','walking','held','falling','landing'].includes(String(input.motion))) result.motion = input.motion
  if (['NotFoundError','InvalidStateError','Other'].includes(String(input.error))) result.error = input.error
  return result as unknown as PetInputTrace
}
export function sanitizeNativePetInput(value: unknown): Record<string,number|boolean> | null {
  if(!value||typeof value!=='object')return null
  const input=value as Record<string,unknown>,result:Record<string,number|boolean>={}
  if(typeof input.overWindow!=='boolean'||typeof input.leftDown!=='boolean')return null
  for(const key of ['overWindow','leftDown','hitPet','captureOnPet','captured','clickThrough','enabled','visible','topmost','noActivate'])if(typeof input[key]==='boolean')result[key]=input[key]
  for(const key of ['x','y','width','height','dpi'])if(typeof input[key]==='number'&&Number.isFinite(input[key])&&Math.abs(input[key])<=1_000_000)result[key]=input[key]
  return result
}

export class InputDiagnostics {
  readonly path: string
  private session = randomUUID()
  private started = performance.now()
  private sequence = 0
  private queue: string[] = []
  private timer: NodeJS.Timeout | null = null
  private writing = Promise.resolve()
  private bytes: number | null = null
  private stopped = false
  private dropped = 0
  constructor(private directory: string, private limit = 2 * 1024 * 1024) { this.path = join(directory,'pet-input.jsonl') }
  record(event: string, data: unknown = {}): void {
    if (this.stopped) return
    if (this.queue.length >= 500) { this.dropped++; return }
    let line: string
    try { line=JSON.stringify({ time:new Date().toISOString(), ms:Math.round(performance.now()-this.started), session:this.session, seq:++this.sequence, event, data })+'\n' }
    catch { this.dropped++;return }
    if(Buffer.byteLength(line)>2048){this.dropped++;return}
    this.queue.push(line)
    if (!this.timer) this.timer = setTimeout(() => { this.timer = null; void this.flush() },250)
  }
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    const batch = this.queue.splice(0)
    if (this.dropped) { batch.push(JSON.stringify({time:new Date().toISOString(),ms:Math.round(performance.now()-this.started),session:this.session,seq:++this.sequence,event:'diagnostic.dropped',data:{count:this.dropped}})+'\n'); this.dropped=0 }
    const text = batch.join('')
    this.writing = this.writing.then(async () => {
      if (!text) return
      try {
        if (this.bytes === null) {
          await mkdir(this.directory,{recursive:true})
          this.bytes = await stat(this.path).then(s=>s.size).catch(()=>0)
        }
        const size = Buffer.byteLength(text)
        if (this.bytes + size > this.limit && this.bytes > 0) {
          await rm(`${this.path}.2`,{force:true})
          await rename(`${this.path}.1`,`${this.path}.2`).catch(error=>{ if (error.code!=='ENOENT') throw error })
          await rename(this.path,`${this.path}.1`).catch(error=>{ if (error.code!=='ENOENT') throw error })
          this.bytes = 0
        }
        await appendFile(this.path,text,'utf8'); this.bytes += size
      } catch { this.stopped=true; this.queue=[] } // Diagnostics must never stop the pet.
    })
    await this.writing
  }
  async close(): Promise<void> { this.stopped=true; await this.flush() }
}
