import { BrowserWindow, screen, Display, powerMonitor } from 'electron'
import { Settings, PetMotion } from '../shared/model'
export class PetController {
  private settings: Settings
  private x = 0
  private direction: 1 | -1 = 1
  private moving = false
  private dragging = false
  private dragOffset = { x: 0, y: 0 }
  private nextAction = 0
  private suspended = false
  private timer: NodeJS.Timeout
  constructor(private window: BrowserWindow, settings: Settings) {
    this.settings = settings
    const display = this.display()
    this.x = display.workArea.x + display.workArea.width * 0.72
    this.place()
    this.window.setIgnoreMouseEvents(true, { forward: true })
    this.timer = setInterval(() => this.tick(), 33)
    screen.on('display-added', this.recover)
    screen.on('display-removed', this.recover)
    screen.on('display-metrics-changed', this.recover)
    powerMonitor.on('suspend', this.sleep)
    powerMonitor.on('resume', this.wake)
    powerMonitor.on('lock-screen', this.sleep)
    powerMonitor.on('unlock-screen', this.wake)
  }
  private display(): Display { return screen.getAllDisplays().find(d => String(d.id) === this.settings.displayId) ?? screen.getPrimaryDisplay() }
  private motion(): void { if (!this.window.isDestroyed()) this.window.webContents.send('pet:motion', { direction: this.direction, moving: this.moving, dragging: this.dragging } satisfies PetMotion) }
  private place(): void {
    if (this.window.isDestroyed()) return
    const area = this.display().workArea, size = this.settings.size
    const width = size + 48, height = size + 80
    this.x = Math.max(area.x, Math.min(this.x, area.x + area.width - width))
    this.window.setBounds({ x: Math.round(this.x), y: area.y + area.height - height, width, height })
  }
  apply(settings: Settings): void {
    const changedDisplay = this.settings.displayId !== settings.displayId
    this.settings = settings
    if (changedDisplay) this.x = this.display().workArea.x + this.display().workArea.width * 0.72
    this.nextAction = 0
    if (settings.visible && !this.suspended) this.window.showInactive(); else this.window.hide()
    if (!this.dragging) this.place()
    this.motion()
  }
  pointer(active: boolean): void {
    if (!this.dragging) this.window.setIgnoreMouseEvents(!active, { forward: true })
  }
  drag(action: string): void {
    const point = screen.getCursorScreenPoint()
    if (action === 'start') {
      const bounds = this.window.getBounds()
      this.dragOffset = { x: point.x - bounds.x, y: point.y - bounds.y }
      this.dragging = true; this.moving = false
      this.window.setIgnoreMouseEvents(false)
    } else if (action === 'end') {
      this.dragging = false
      const bounds = this.window.getBounds(), display = screen.getDisplayMatching(bounds)
      this.settings.displayId = String(display.id)
      this.x = bounds.x; this.place(); this.nextAction = Date.now() + 2500
      this.window.setIgnoreMouseEvents(true, { forward: true })
    }
    this.motion()
  }
  get selectedDisplay(): string | null { return this.settings.displayId }
  private tick(): void {
    if (this.window.isDestroyed() || this.suspended || !this.settings.visible) return
    if (this.dragging) {
      const point = screen.getCursorScreenPoint()
      this.window.setPosition(Math.round(point.x - this.dragOffset.x), Math.round(point.y - this.dragOffset.y))
      return
    }
    if (this.settings.paused) { if (this.moving) { this.moving = false; this.motion() }; return }
    if (Date.now() > this.nextAction) {
      this.moving = !this.moving
      this.nextAction = Date.now() + (this.moving ? 4000 + Math.random() * 5000 : 3000 + Math.random() * 5000)
      this.motion()
    }
    if (!this.moving) return
    const area = this.display().workArea, width = this.settings.size + 48
    this.x += this.direction * 0.9
    if (this.x <= area.x || this.x >= area.x + area.width - width) { this.direction = this.direction === 1 ? -1 : 1; this.motion() }
    this.place()
  }
  private recover = (): void => { this.dragging = false; this.place(); this.motion() }
  private sleep = (): void => { this.suspended = true; this.window.hide() }
  private wake = (): void => { this.suspended = false; this.apply(this.settings); this.recover() }
  destroy(): void {
    clearInterval(this.timer)
    screen.removeListener('display-added', this.recover); screen.removeListener('display-removed', this.recover); screen.removeListener('display-metrics-changed', this.recover)
    powerMonitor.removeListener('suspend', this.sleep); powerMonitor.removeListener('resume', this.wake)
    powerMonitor.removeListener('lock-screen', this.sleep); powerMonitor.removeListener('unlock-screen', this.wake)
  }
}
