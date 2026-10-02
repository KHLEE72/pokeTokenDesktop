import { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, screen } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import { defaultSettings, newGame, Settings, Snapshot } from '../shared/model'
import { SpriteCache } from './sprites'
import { PetController } from './pet'
import { WindowTracker } from './window-tracker'

app.setName('PokeToken Desktop')
app.setPath('userData', process.env.POKETOKEN_DATA_DIR || join(app.getPath('appData'), 'PokeToken Desktop'))
const acquired = app.requestSingleInstanceLock()
let dashboard: BrowserWindow, pet: BrowserWindow, controller: PetController, tray: Tray, worker: Worker, sprites: SpriteCache, windowTracker: WindowTracker
let quitting = false, nextId = 1
let snapshot: Snapshot = { game: newGame(), settings: defaultSettings(), usage: { claude: { today: 0, all: 0 }, codex: { today: 0, all: 0 } }, roots: [], scanning: true, lastScan: null, notice: null }
const pending = new Map<number, { resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()
const request = (op: string, patch?: Partial<Settings>): Promise<void> => new Promise((resolve, reject) => {
  const id = nextId++
  const timer = setTimeout(() => { pending.delete(id); reject(new Error('처리 시간이 길어지고 있습니다. 잠시 후 다시 확인해주세요.')) }, 120_000)
  pending.set(id, { resolve, reject, timer }); worker.postMessage({ id, op, patch })
})
function load(window: BrowserWindow, view: string): void {
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}?view=${view}`)
  else void window.loadFile(join(__dirname, '../renderer/index.html'), { query: { view } })
}
function openDashboard(tab = 'home'): void {
  dashboard.show(); dashboard.focus(); dashboard.webContents.send('navigate', tab)
}
function trayMenu(): void {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '현재 펫 · 사용량', click: () => openDashboard() },
    { label: snapshot.settings.visible ? '펫 숨기기' : '펫 보이기', click: () => void request('settings', { visible: !snapshot.settings.visible }).catch(() => {}) },
    { label: snapshot.settings.paused ? '다시 걷기' : '이동 일시정지', click: () => void request('settings', { paused: !snapshot.settings.paused }).catch(() => {}) },
    { label: '설정', click: () => openDashboard('settings') }, { type: 'separator' }, { label: '종료', click: () => app.quit() }
  ]))
}
function validatePatch(value: unknown): Partial<Settings> {
  if (!value || typeof value !== 'object') throw new Error('잘못된 설정')
  const p = value as Record<string, unknown>, result: Partial<Settings> = {}
  for (const key of ['visible', 'paused', 'autoStart'] as const) if (key in p) { if (typeof p[key] !== 'boolean') throw new Error('잘못된 설정'); result[key] = p[key] }
  if ('pace' in p) { if (!['fast', 'normal', 'slow'].includes(String(p.pace))) throw new Error('잘못된 속도'); result.pace = p.pace as Settings['pace'] }
  if ('size' in p) { if (![96, 128, 192].includes(p.size as number)) throw new Error('잘못된 크기'); result.size = p.size as Settings['size'] }
  if ('displayId' in p) { if (p.displayId !== null && !screen.getAllDisplays().some(d => String(d.id) === p.displayId)) throw new Error('연결되지 않은 화면'); result.displayId = p.displayId as string | null }
  if ('roots' in p) {
    const roots = p.roots as Settings['roots']
    if (!roots || !['claude', 'codex'].every(k => Array.isArray(roots[k as keyof typeof roots]) && roots[k as keyof typeof roots].length <= 20 && roots[k as keyof typeof roots].every(v => typeof v === 'string' && v.length > 0 && v.length < 2048))) throw new Error('잘못된 로그 폴더')
    result.roots = { claude: [...new Set(roots.claude)], codex: [...new Set(roots.codex)] }
  }
  return result
}
if (!acquired) app.quit()
else {
  app.on('second-instance', () => { if (dashboard) openDashboard() })
  void app.whenReady().then(() => {
    mkdirSync(app.getPath('userData'), { recursive: true })
    sprites = new SpriteCache(join(app.getPath('userData'), 'sprites'))
    const preferences = { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    dashboard = new BrowserWindow({ width: 1040, height: 800, minWidth: 850, minHeight: 680, show: false, backgroundColor: '#f6f7f2', autoHideMenuBar: true, title: 'PokeToken Desktop', webPreferences: preferences })
    pet = new BrowserWindow({ width: 176, height: 208, show: false, frame: false, transparent: true, resizable: false, maximizable: false, minimizable: false, hasShadow: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, webPreferences: { ...preferences, backgroundThrottling: false } })
    pet.setAlwaysOnTop(true, 'floating')
    if (process.platform === 'darwin') { pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); app.dock?.hide() }
    controller = new PetController(pet, snapshot.settings, id => {
      if (!quitting && worker && snapshot.settings.displayId !== id) void request('settings', { displayId: id }).catch(() => {})
    })
    // Generic interaction smoke tests remain deterministic; the window-specific
    // smoke test explicitly enables the real native scanner in its isolated app.
    if (process.env.POKETOKEN_TEST_MODE !== '1' || process.env.POKETOKEN_WINDOW_TEST === '1') windowTracker = new WindowTracker(frames => {
      const fixturePid = process.env.POKETOKEN_TEST_MODE === '1' ? Number(process.env.POKETOKEN_WINDOW_TEST_PID) : 0
      const selected = fixturePid ? frames.filter(frame => frame.pid === fixturePid) : frames
      if (process.env.POKETOKEN_TEST_MODE === '1' && process.env.POKETOKEN_WINDOW_TEST === '1') Object.assign(globalThis, { petTestFrames: selected, petTestRawPids: frames.map(frame => frame.pid) })
      controller.updateSurfaces(selected)
    })
    const trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAFUlEQVR4nGNgGAWjYBSMglEwCkbBAAAGGAAB7e3H/QAAAABJRU5ErkJggg==')
    // Icon generated from our own egg drawing; no Pokémon art is bundled.
    const icon = nativeImage.createFromPath(join(__dirname, '../../build/tray.png'))
    const menuIcon = (icon.isEmpty() ? trayIcon : icon).resize({ width: process.platform === 'darwin' ? 18 : 24, height: process.platform === 'darwin' ? 18 : 24 })
    if (process.platform === 'darwin') menuIcon.setTemplateImage(true)
    tray = new Tray(menuIcon)
    tray.setToolTip('PokeToken Desktop'); tray.on('click', () => openDashboard()); trayMenu()
    dashboard.on('close', event => { if (!quitting) { event.preventDefault(); dashboard.hide() } })
    for (const window of [dashboard, pet]) {
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      window.webContents.on('will-navigate', event => event.preventDefault())
    }
    dashboard.once('ready-to-show', () => { if (!process.argv.includes('--hidden') && !app.getLoginItemSettings().wasOpenedAtLogin) dashboard.show() })
    pet.webContents.on('did-finish-load', () => controller.apply(snapshot.settings))
    load(dashboard, 'dashboard'); load(pet, 'pet')
    worker = new Worker(join(__dirname, 'worker.js'), { workerData: { path: join(app.getPath('userData'), 'poketoken.sqlite') } })
    worker.on('message', message => {
      if (message.type === 'snapshot') {
        snapshot = message.value
        controller.apply(snapshot.settings); trayMenu()
        for (const window of [dashboard, pet]) if (!window.isDestroyed()) window.webContents.send('snapshot', snapshot)
      } else if (message.type === 'reply') {
        const p = pending.get(message.id)
        if (p) { clearTimeout(p.timer); pending.delete(message.id); message.error ? p.reject(new Error(message.error)) : p.resolve() }
      } else if (message.type === 'error') { snapshot.notice = message.message; dashboard.webContents.send('snapshot', snapshot) }
    })
    worker.on('error', () => { snapshot.scanning = false; snapshot.notice = '저장소를 열지 못했습니다. 앱을 다시 실행해주세요.'; dashboard.webContents.send('snapshot', snapshot) })
    const allowed = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): void => {
      if (![dashboard.webContents.id, pet.webContents.id].includes(event.sender.id)) throw new Error('허용되지 않은 요청')
    }
    ipcMain.handle('snapshot:get', event => { allowed(event); return snapshot })
    ipcMain.handle('settings:update', async (event, value) => {
      allowed(event); const patch = validatePatch(value)
      if (patch.autoStart !== undefined) app.setLoginItemSettings({ openAtLogin: patch.autoStart, path: process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe'), args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'] })
      await request('settings', patch)
    })
    ipcMain.handle('usage:refresh', async event => { allowed(event); await request('refresh') })
    ipcMain.handle('folder:choose', async (event, provider) => { allowed(event); if (!['claude', 'codex'].includes(provider)) return null; const result = await dialog.showOpenDialog(dashboard, { title: '로그 폴더 선택', properties: ['openDirectory'] }); return result.canceled ? null : result.filePaths[0] })
    ipcMain.handle('display:list', event => { allowed(event); return screen.getAllDisplays().map((d, i) => ({ id: String(d.id), label: `${d.label || `화면 ${i + 1}`} · ${d.size.width} × ${d.size.height}${d.id === screen.getPrimaryDisplay().id ? ' (기본)' : ''}` })) })
    ipcMain.handle('sprite:get', (event, id) => { allowed(event); return sprites.get(id) })
    ipcMain.handle('dashboard:open', (event, tab) => { allowed(event); openDashboard(['home', 'dex', 'settings'].includes(tab) ? tab : 'home') })
    ipcMain.on('pet:pointer', (event, active) => { allowed(event); if (event.sender.id === pet.webContents.id) controller.pointer(active === true) })
    ipcMain.on('pet:drag', (event, action) => { allowed(event); if (event.sender.id !== pet.webContents.id || !['start', 'move', 'end', 'cancel'].includes(action)) return; controller.drag(action); if (action === 'end') void request('settings', { displayId: controller.selectedDisplay }).catch(() => {}) })
    ipcMain.on('pet:menu', event => { allowed(event); if (event.sender.id === pet.webContents.id) Menu.buildFromTemplate([
      { label: '현재 펫 · 사용량', click: () => openDashboard() }, { label: '이동 일시정지 / 다시 걷기', click: () => void request('settings', { paused: !snapshot.settings.paused }).catch(() => {}) },
      { label: '설정', click: () => openDashboard('settings') }, { label: '펫 숨기기', click: () => void request('settings', { visible: false }).catch(() => {}) }
    ]).popup({ window: pet }) })
    void request('refresh').catch(() => {})
    const scanTimer = setInterval(() => { if (!snapshot.scanning) void request('scan').catch(() => {}) }, 10_000)
    app.on('before-quit', () => { quitting = true; clearInterval(scanTimer); windowTracker?.destroy(); controller.destroy(); tray.destroy(); void worker.terminate(); for (const p of pending.values()) clearTimeout(p.timer) })
  })
  app.on('window-all-closed', () => { /* tray companion keeps running */ })
  app.on('activate', () => { if (dashboard) openDashboard() })
}
