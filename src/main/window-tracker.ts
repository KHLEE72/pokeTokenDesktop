import { app, screen } from 'electron'
import { spawn, ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { decodeWindowFrames, WindowFrame } from './surfaces'

export class WindowTracker {
  private child: ChildProcess | null = null
  private retry: NodeJS.Timeout | null = null
  private watchdog: NodeJS.Timeout
  private lastRead = 0
  private stopped = false
  private failures = 0
  constructor(private update: (frames: WindowFrame[]) => void) {
    this.start()
    this.watchdog = setInterval(() => { if (this.lastRead && Date.now() - this.lastRead > 1500) { this.lastRead = 0; this.update([]) } }, 500)
  }
  private start(): void {
    if (this.stopped) return
    let executable: string, args: string[]
    if (process.platform === 'win32') {
      const script = app.isPackaged ? join(process.resourcesPath, 'native/window-surfaces.ps1') : join(app.getAppPath(), 'native/window-surfaces.ps1')
      executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
      args = ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-AppProcessId',String(process.pid)]
    } else if (process.platform === 'darwin') {
      executable = app.isPackaged ? join(process.resourcesPath, 'native/window-surfaces') : join(app.getAppPath(), 'build/native/window-surfaces')
      args = [String(process.pid)]
    } else return
    if (!existsSync(executable)) { this.update([]); return }
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore','pipe','pipe'] })
    child.stderr?.on('data', data => console.warn('Window tracking helper:', String(data).slice(0,2048)))
    this.child = child
    const lines = createInterface({ input: child.stdout! })
    lines.on('line', line => {
      if (this.stopped || this.child !== child) return
      const frames = decodeWindowFrames(line, process.pid, rect => process.platform === 'win32' ? screen.screenToDipRect(null, rect) : rect)
      if (frames) { this.lastRead = Date.now(); this.failures = 0; this.update(frames) }
    })
    const ended = (): void => {
      lines.close()
      if (this.child !== child) return
      this.child = null; this.lastRead = 0; this.update([])
      if (!this.stopped && ++this.failures <= 3) this.retry = setTimeout(() => this.start(), 3000)
    }
    child.on('error', ended); child.on('exit', ended)
  }
  destroy(): void {
    this.stopped = true
    clearInterval(this.watchdog)
    if (this.retry) clearTimeout(this.retry)
    this.child?.kill(); this.child = null
  }
}
