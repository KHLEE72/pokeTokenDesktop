import { BrowserWindow, screen, Display, powerMonitor } from 'electron'
import { Settings, PetMotion, PetMotionState } from '../shared/model'
import { Ledge, WindowFrame, windowLedges } from './surfaces'

const GRAVITY = 2200 // DIP / second²; independent of screen scale and timer frequency.
const TERMINAL_SPEED = 1200
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, Math.max(min, max)))

export class PetController {
  private settings: Settings
  private displayId: string | null
  private x = 0
  private y = 0
  private direction: 1 | -1 = 1
  private state: PetMotionState = 'idle'
  private tilt = 0
  private impact = 0
  private velocityY = 0
  private dragOffset = { x: 0, y: 0 }
  private previousCursor = { x: 0, y: 0 }
  private nextAction = Date.now() + 2500
  private landingUntil = 0
  private lastTick = Date.now()
  private asleep = false
  private locked = false
  private ignoringMouse: boolean | null = null
  private timer: NodeJS.Timeout
  private ledges: Ledge[] = []
  private frames: WindowFrame[] = []
  private perch: { id: string; offset: number } | null = null
  private fallOrigin = 0

  constructor(private window: BrowserWindow, settings: Settings, private onDisplayChanged: (id: string) => void = () => {}) {
    this.settings = { ...settings }
    this.displayId = settings.displayId
    this.x = this.display().workArea.x + this.display().workArea.width * 0.72
    this.ground()
    this.ignoreMouse(true)
    this.timer = setInterval(() => this.tick(), 33)
    screen.on('display-added', this.recover)
    screen.on('display-removed', this.recover)
    screen.on('display-metrics-changed', this.recover)
    powerMonitor.on('suspend', this.sleep)
    powerMonitor.on('resume', this.wake)
    powerMonitor.on('lock-screen', this.lock)
    powerMonitor.on('unlock-screen', this.unlock)
  }

  private get suspended(): boolean { return this.asleep || this.locked }
  private ignoreMouse(ignore: boolean, force = false): void {
    if (this.window.isDestroyed() || (!force && this.ignoringMouse === ignore)) return
    this.window.setIgnoreMouseEvents(ignore, { forward: true })
    this.ignoringMouse = ignore
  }
  private syncPointer(): void {
    if (this.window.isDestroyed()) return
    if (this.suspended || !this.settings.visible) { this.ignoreMouse(true); return }
    if (this.state === 'held') { this.ignoreMouse(false); return }
    // DOM pointerenter may not fire again after hide/show or unlocking. Use DIP
    // cursor coordinates as a fallback, also when the character walks underneath it.
    const point = screen.getCursorScreenPoint(), bounds = this.window.getBounds()
    const size = this.settings.size
    const left = bounds.x + (bounds.width - size) / 2
    const top = bounds.y + bounds.height - size - 6 // .pet-character bottom: 6px
    const overCharacter = point.x >= left && point.x < left + size && point.y >= top && point.y < top + size
    this.ignoreMouse(!overCharacter)
  }
  private display(): Display {
    return screen.getAllDisplays().find(d => String(d.id) === this.displayId) ?? screen.getPrimaryDisplay()
  }
  private dimensions(): { width: number; height: number } { return { width: this.settings.size + 48, height: this.settings.size + 80 } }
  private floor(): number { const area = this.display().workArea; return area.y + area.height - this.dimensions().height }
  private feet(): number { return this.y + this.dimensions().height - 6 }
  private centre(): number { return this.x + 24 + this.settings.size / 2 }
  private range(ledge: Ledge, centre = this.centre()): { left: number; right: number; display: Display } | null {
    const display = screen.getDisplayMatching({ x: Math.round(centre), y: Math.round(ledge.y), width: 1, height: 1 })
    const area = display.workArea, half = this.settings.size / 2
    if (ledge.y - this.dimensions().height + 6 < area.y || ledge.y > area.y + area.height - 6) return null
    const left = Math.max(ledge.x + half, area.x + 24 + half)
    const right = Math.min(ledge.x + ledge.width - half, area.x + area.width - 24 - half)
    return right >= left ? { left, right, display } : null
  }
  private landingLedge(from: number, to: number): Ledge | undefined {
    const centre = this.centre()
    return this.ledges.filter(ledge => {
      const range = this.range(ledge)
      return range && centre >= range.left && centre <= range.right && ledge.y >= from && ledge.y <= to
    }).sort((a,b) => a.y - b.y)[0]
  }
  private selectDisplay(id: string): void {
    if (id !== this.displayId) { this.displayId = id; this.onDisplayChanged(id) }
  }
  private beginFall(): void {
    this.perch = null; this.state = 'falling'; this.velocityY = 0; this.tilt = 0
    this.fallOrigin = this.feet(); this.lastTick = Date.now(); this.motion()
  }
  private followPerch(): void {
    if (!this.perch || this.state === 'held') return
    const frame = this.frames.find(frame => frame.id === this.perch!.id)
    if (!frame) { this.beginFall(); return }
    const desired = frame.x + this.perch.offset
    const candidates = this.ledges.filter(ledge => ledge.id === frame.id)
    let ledge = candidates.find(ledge => { const range = this.range(ledge, desired); return range && desired >= range.left && desired <= range.right })
    // Resizing an exposed window may push the old offset past its edge. Occlusion
    // instead drops the pet; do not teleport it to another exposed fragment.
    if (!ledge) ledge = candidates.find(ledge => ledge.x === frame.x && ledge.width === frame.width && this.range(ledge, desired))
    if (!ledge) { this.beginFall(); return }
    const range = this.range(ledge, desired)!
    const centre = clamp(desired, range.left, range.right)
    this.x = centre - 24 - this.settings.size / 2
    this.y = ledge.y - this.dimensions().height + 6
    this.perch.offset = centre - frame.x
    this.selectDisplay(String(range.display.id)); this.position()
  }
  updateSurfaces(frames: WindowFrame[]): void {
    this.frames = frames; this.ledges = windowLedges(frames)
    if (!this.suspended && this.settings.visible) this.followPerch()
  }
  private clampX(): void {
    const area = this.display().workArea
    this.x = clamp(this.x, area.x, area.x + area.width - this.dimensions().width)
  }
  private motion(): void {
    if (!this.window.isDestroyed()) this.window.webContents.send('pet:motion', {
      direction: this.direction, state: this.state, tilt: this.tilt, impact: this.impact, surfaceId: this.perch?.id ?? null
    } satisfies PetMotion)
  }
  private position(): void { this.window.setPosition(Math.round(this.x), Math.round(this.y)); this.syncPointer() }
  private ground(): void {
    if (this.window.isDestroyed()) return
    this.clampX(); this.y = this.floor()
    this.window.setBounds({ x: Math.round(this.x), y: Math.round(this.y), ...this.dimensions() })
  }

  apply(settings: Settings): void {
    const before = this.settings
    const changedDisplay = settings.displayId !== before.displayId
    // A drop selects a display immediately. A later snapshot confirming that selection
    // must not teleport the falling pet back to the floor.
    const relocate = changedDisplay && settings.displayId !== this.displayId
    if (changedDisplay) this.displayId = settings.displayId
    this.settings = { ...settings }
    if (relocate) {
      this.x = this.display().workArea.x + this.display().workArea.width * 0.72
      this.recover()
    } else if (settings.size !== before.size) {
      if (this.state !== 'held') this.y -= settings.size - before.size
      this.clampX(); this.y = Math.min(this.y, this.floor())
      this.window.setBounds({ x: Math.round(this.x), y: Math.round(this.y), ...this.dimensions() })
      this.followPerch()
    }
    if (!settings.visible && before.visible) this.recover()
    if (settings.paused && this.state === 'walking') { this.state = 'idle'; this.motion() }
    if (settings.paused !== before.paused) this.nextAction = Date.now() + 2500
    if (settings.visible && !this.suspended) this.window.showInactive(); else this.window.hide()
    this.syncPointer()
    this.motion()
  }

  pointer(active: boolean): void {
    if (this.suspended || !this.settings.visible) { this.ignoreMouse(true); return }
    if (this.state !== 'held') this.ignoreMouse(!active)
  }
  drag(action: string): void {
    if (this.window.isDestroyed() || this.suspended || !this.settings.visible) return
    const point = screen.getCursorScreenPoint()
    if (action === 'start') {
      const bounds = this.window.getBounds()
      this.dragOffset = { x: point.x - bounds.x, y: point.y - bounds.y }
      this.previousCursor = point
      this.x = bounds.x; this.y = bounds.y
      this.state = 'held'; this.tilt = 0; this.velocityY = 0; this.impact = 0
      this.lastTick = Date.now()
      this.ignoreMouse(false)
    } else if (action === 'cancel' && this.state === 'held') {
      // A simple click still shows the held pose immediately, then opens the
      // dashboard. If the click caught a falling pet, let it continue down.
      this.tilt = 0; this.velocityY = 0; this.lastTick = Date.now()
      if (this.perch) {
        this.state = 'idle'; this.followPerch()
      } else {
        this.state = this.y < this.floor() - 1 ? 'falling' : 'idle'
        if (this.state === 'idle') { this.y = this.floor(); this.nextAction = Date.now() + 2500; this.position() }
      }
      this.syncPointer()
    } else if (action === 'end' && this.state === 'held') {
      // Include cursor movement since the last animation tick, then keep the release
      // height. Only the subsequent gravity ticks move the pet downwards.
      this.x = point.x - this.dragOffset.x; this.y = point.y - this.dragOffset.y
      this.displayId = String(screen.getDisplayMatching({ x: Math.round(this.x), y: Math.round(this.y), ...this.dimensions() }).id)
      this.clampX()
      this.y = clamp(this.y, this.display().workArea.y, this.floor())
      const distance = Math.max(0, this.floor() - this.y)
      this.impact = Math.min(1, distance / 450)
      this.velocityY = 0; this.tilt = 0; this.lastTick = Date.now()
      this.position()
      this.beginFall()
      const nearby = this.landingLedge(this.feet() - 24, this.feet() + 24)
      if (nearby) this.land(nearby); else if (distance < 1) this.land()
      this.syncPointer()
    } else return
    this.motion()
  }
  get selectedDisplay(): string | null { return this.displayId }

  private land(ledge?: Ledge): void {
    if (ledge) {
      this.perch = { id: ledge.id, offset: this.centre() - ledge.frameX }
      this.y = ledge.y - this.dimensions().height + 6
      this.selectDisplay(String(this.range(ledge)!.display.id))
    } else { this.perch = null; this.y = this.floor() }
    this.impact = clamp((this.feet() - this.fallOrigin) / 450, 0, 1)
    this.velocityY = 0; this.tilt = 0
    this.state = 'landing'
    this.landingUntil = Date.now() + 620
    this.position(); this.motion()
  }
  private tick(): void {
    const now = Date.now(), elapsed = clamp((now - this.lastTick) / 1000, 0, 0.05)
    this.lastTick = now
    if (this.window.isDestroyed() || this.suspended || !this.settings.visible) return
    this.syncPointer()
    this.followPerch()
    if (this.state === 'held') {
      const point = screen.getCursorScreenPoint()
      const targetTilt = clamp(-(point.x - this.previousCursor.x) * 0.65, -24, 24)
      this.tilt += (targetTilt - this.tilt) * Math.min(1, elapsed * 12)
      this.previousCursor = point
      this.x = point.x - this.dragOffset.x; this.y = point.y - this.dragOffset.y
      this.position(); this.motion()
      return
    }
    // Pausing autonomous walking still permits a released pet to finish its fall.
    if (this.state === 'falling') {
      const beforeFeet = this.feet()
      this.velocityY = Math.min(TERMINAL_SPEED, this.velocityY + GRAVITY * elapsed)
      this.y += this.velocityY * elapsed
      const ledge = this.landingLedge(beforeFeet - 0.5, this.feet())
      if (ledge) this.land(ledge); else if (this.y >= this.floor()) this.land(); else this.position()
      return
    }
    if (this.state === 'landing') {
      if (now >= this.landingUntil) { this.state = 'idle'; this.nextAction = now + 2500; this.motion() }
      return
    }
    if (this.settings.paused) return
    if (now > this.nextAction) {
      this.state = this.state === 'walking' ? 'idle' : 'walking'
      this.nextAction = now + (this.state === 'walking' ? 4000 + Math.random() * 5000 : 3000 + Math.random() * 5000)
      this.motion()
    }
    if (this.state !== 'walking') return
    const area = this.display().workArea, width = this.dimensions().width
    const ledge = this.perch && this.ledges.find(ledge => ledge.id === this.perch!.id && this.range(ledge) && this.centre() >= this.range(ledge)!.left && this.centre() <= this.range(ledge)!.right)
    const range = ledge ? this.range(ledge)! : null
    const left = range ? range.left - 24 - this.settings.size / 2 : area.x
    const right = range ? range.right - 24 - this.settings.size / 2 : area.x + area.width - width
    this.x += this.direction * 27 * elapsed
    if (this.x <= left || this.x >= right) {
      this.direction = this.direction === 1 ? -1 : 1; this.x = clamp(this.x, left, right); this.motion()
    }
    if (this.perch && ledge) this.perch.offset = this.centre() - ledge.frameX
    this.position()
  }
  private recover = (): void => {
    if (this.window.isDestroyed()) return
    this.state = 'idle'; this.tilt = 0; this.velocityY = 0; this.impact = 0
    this.perch = null
    this.lastTick = Date.now(); this.nextAction = Date.now() + 2500
    this.ground()
    this.window.webContents.send('pet:reset-interaction')
    // Re-arm native forwarding rather than reapplying an already-enabled flag.
    this.ignoreMouse(false, true)
    this.syncPointer()
    this.motion()
  }
  private hideForSession(): void { this.recover(); this.window.hide() }
  private restoreSession(): void {
    if (this.suspended) return
    this.recover(); this.apply(this.settings)
  }
  private sleep = (): void => { this.asleep = true; this.hideForSession() }
  private wake = (): void => { this.asleep = false; this.restoreSession() }
  private lock = (): void => { this.locked = true; this.hideForSession() }
  private unlock = (): void => { this.locked = false; this.restoreSession() }
  destroy(): void {
    clearInterval(this.timer)
    screen.removeListener('display-added', this.recover); screen.removeListener('display-removed', this.recover); screen.removeListener('display-metrics-changed', this.recover)
    powerMonitor.removeListener('suspend', this.sleep); powerMonitor.removeListener('resume', this.wake)
    powerMonitor.removeListener('lock-screen', this.lock); powerMonitor.removeListener('unlock-screen', this.unlock)
  }
}
