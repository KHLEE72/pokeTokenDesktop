export interface WindowFrame { id: string; pid: number; x: number; y: number; width: number; height: number }
export interface Ledge { id: string; x: number; y: number; width: number; frameX: number }

// Frames arrive front to back. Only exposed portions of a window's top edge are
// solid: landing on a covered title bar would leave the pet floating over content.
export function windowLedges(frames: readonly WindowFrame[]): Ledge[] {
  const result: Ledge[] = []
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]
    let spans = [[frame.x, frame.x + frame.width]]
    for (let j = 0; j < i && spans.length; j++) {
      const front = frames[j]
      if (front.y > frame.y || front.y + front.height <= frame.y) continue
      spans = spans.flatMap(([left, right]) => {
        if (front.x >= right || front.x + front.width <= left) return [[left, right]]
        const remaining: number[][] = []
        if (front.x > left) remaining.push([left, front.x])
        if (front.x + front.width < right) remaining.push([front.x + front.width, right])
        return remaining
      })
    }
    for (const [left, right] of spans) if (right > left) result.push({ id: frame.id, x: left, y: frame.y, width: right - left, frameX: frame.x })
  }
  return result
}

export function decodeWindowFrames(line: string, excludedPid: number, convert: (rect: Electron.Rectangle) => Electron.Rectangle = rect => rect): WindowFrame[] | null {
  if (line.length > 256 * 1024) return null
  let data: unknown
  try { data = JSON.parse(line) } catch { return null }
  if (!Array.isArray(data) || data.length > 256) return null
  const frames: WindowFrame[] = [], ids = new Set<string>()
  for (const value of data) {
    if (!value || typeof value !== 'object') continue
    const v = value as WindowFrame
    if (typeof v.id !== 'string' || v.id.length > 80 || ids.has(v.id) || !Number.isInteger(v.pid) || v.pid <= 0 || v.pid === excludedPid) continue
    if (![v.x,v.y,v.width,v.height].every(n => Number.isFinite(n) && Math.abs(n) < 100_000) || v.width < 80 || v.height < 40) continue
    const rect = convert({ x: v.x, y: v.y, width: v.width, height: v.height })
    if (![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite) || rect.width < 80 || rect.height < 40) continue
    ids.add(v.id); frames.push({ id: v.id, pid: v.pid, ...rect })
  }
  return frames
}
