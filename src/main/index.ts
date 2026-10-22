import { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, screen, shell } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import { defaultSettings, EGG_TYPES, GameAction, newGame, Settings, Snapshot } from '../shared/model'
import { SpriteCache } from './sprites'
import { PetController } from './pet'
import { WindowTracker } from './window-tracker'
import { InputDiagnostics, sanitizePetTrace } from './input-diagnostics'
import { isBall, isTheme } from '../shared/rewards'
import { activePet, validateAutoHatchConfig } from '../shared/game'
import { isLanguage, translator } from '../shared/i18n'
import { isDexSort } from '../shared/dex'
import { LEAGUE_BY_ID, LeagueDisplay } from '../shared/league'
import { createUpdates, portableUpdateStarted } from './update-service'
import type { UpdateController } from './updates'
import { LoginStart } from './login-start'

app.setName('PokeToken Desktop')
app.setPath('userData', process.env.POKETOKEN_DATA_DIR || join(app.getPath('appData'), 'PokeToken Desktop'))
const acquired = app.requestSingleInstanceLock()
let dashboard: BrowserWindow, pet: BrowserWindow, controller: PetController, tray: Tray, worker: Worker, sprites: SpriteCache
let windowTracker: WindowTracker | undefined
let preferences: Electron.WebPreferences
let quitting = false, nextId = 1
let diagnostics: InputDiagnostics
let updates:UpdateController|undefined
let snapshot: Snapshot = { game: newGame(), settings: defaultSettings(), rewards: { unlocked: {} }, usage: { claude: { today: 0, all: 0 }, codex: { today: 0, all: 0 } }, roots: [], scanning: true, lastScan: null, notice: null }
const pending = new Map<number, { resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()
const request = (op: string, patch?: Partial<Settings>, action?: GameAction, display?:LeagueDisplay): Promise<void> => new Promise((resolve, reject) => {
  const id = nextId++
  const timer = setTimeout(() => { pending.delete(id); reject(new Error('처리 시간이 길어지고 있습니다. 잠시 후 다시 확인해주세요.')) }, 120_000)
  pending.set(id, { resolve, reject, timer }); worker.postMessage({ id, op, patch, action, display })
})
function load(window: BrowserWindow, view: string): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) return window.loadURL(`${process.env.ELECTRON_RENDERER_URL}?view=${view}`)
  return window.loadFile(join(__dirname, '../renderer/index.html'), { query: { view } })
}
function createPetWindow(): BrowserWindow {
  const size=snapshot.settings.size
  const window=new BrowserWindow({ width:size+48,height:size+80,show:false,frame:false,transparent:true,resizable:false,maximizable:false,minimizable:false,hasShadow:false,alwaysOnTop:true,skipTaskbar:true,focusable:false,webPreferences:{...preferences,backgroundThrottling:false,zoomFactor:1} })
  window.webContents.setZoomMode('disabled')
  void window.webContents.setVisualZoomLevelLimits(1,1)
  if(process.platform==='darwin')window.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true})
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  window.webContents.on('will-navigate',event=>event.preventDefault())
  window.webContents.on('before-mouse-event',(_event,input)=>{
    if(window!==pet || !['mouseDown','mouseUp','contextMenu'].includes(input.type))return
    diagnostics.record('electron.mouse',{windowId:window.id,type:input.type,button:input.button,x:input.x,y:input.y,state:controller.inputState})
  })
  window.webContents.on('input-event',(_event,input)=>{
    if(window===pet && ['mouseDown','mouseUp','pointerDown','pointerUp','pointerCancel','touchStart','touchEnd','touchCancel'].includes(input.type))diagnostics.record('electron.input',{windowId:window.id,type:input.type})
  })
  if(process.platform==='win32')for(const [message,type] of [[0x21,'mouse-activate'],[0x201,'left-down'],[0x202,'left-up'],[0x203,'left-double-click'],[0x215,'capture-changed'],[0x1f,'cancel-mode']] as const){
    // Record only a fixed message label from our own HWND, never raw message
    // buffers or another application's window handle/content.
    window.hookWindowMessage(message,()=>{if(window===pet)diagnostics.record('windows.message',{windowId:window.id,type})})
  }
  const state=():object=>({windowId:window.id,current:window===pet,state:controller?.inputState})
  window.webContents.on('render-process-gone',(_event,details)=>diagnostics.record('renderer.gone',{...state(),reason:details.reason,exitCode:details.exitCode}))
  window.webContents.on('unresponsive',()=>diagnostics.record('renderer.unresponsive',state()))
  window.webContents.on('responsive',()=>diagnostics.record('renderer.responsive',state()))
  window.webContents.on('did-finish-load',()=>diagnostics.record('renderer.did-finish-load',state()))
  return window
}
function startWindowTracker(window: BrowserWindow): void {
  windowTracker?.destroy();windowTracker=undefined
  const observeInput=(data:Record<string,number|boolean>):void=>{
    if(window!==pet || window.isDestroyed())return
    diagnostics.record('windows.input',{...data,windowId:window.id,units:'physicalPx',state:controller.inputState})
    controller.observeNativeInput(window.id,data)
  }
  if(process.env.POKETOKEN_TEST_MODE==='1')Object.assign(globalThis,{petTestNativeInput:observeInput})
  if(process.env.POKETOKEN_TEST_MODE==='1' && process.env.POKETOKEN_WINDOW_TEST!=='1')return
  windowTracker=new WindowTracker(frames=>{
    const fixturePid=process.env.POKETOKEN_TEST_MODE==='1'?Number(process.env.POKETOKEN_WINDOW_TEST_PID):0
    const selected=fixturePid?frames.filter(frame=>frame.pid===fixturePid || frame.pid===process.pid):frames
    if(process.env.POKETOKEN_TEST_MODE==='1' && process.env.POKETOKEN_WINDOW_TEST==='1')Object.assign(globalThis,{petTestFrames:selected,petTestRawPids:frames.map(frame=>frame.pid)})
    controller.updateSurfaces(selected)
  },window,observeInput)
}
async function replacePetWindow(previous: BrowserWindow): Promise<BrowserWindow> {
  if(quitting)throw new Error('Application is closing')
  const candidate=createPetWindow()
  pet=candidate // New preload requests are authorized before its page loads.
  diagnostics.record('pet.window-created',{previousId:previous.id,windowId:candidate.id,previousHandle:previous.getNativeWindowHandle().toString('hex'),handle:candidate.getNativeWindowHandle().toString('hex')})
  let timeout:NodeJS.Timeout|undefined
  let onReady:()=>void=()=>{}
  try{
    const paint=new Promise<void>(resolve=>{onReady=resolve;candidate.once('ready-to-show',onReady)})
    const deadline=new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>reject(new Error('Pet page did not become ready')),10000)})
    await Promise.race([Promise.all([load(candidate,'pet'),paint]),deadline])
    if(quitting || candidate.isDestroyed())throw new Error('Application is closing')
    candidate.webContents.send('snapshot',snapshot)
    startWindowTracker(candidate) // The native observer must follow the new HWND.
    if(!previous.isDestroyed())previous.destroy()
    return candidate
  }catch(error){
    if(pet===candidate)pet=previous
    if(!candidate.isDestroyed())candidate.destroy()
    throw error
  }finally{
    if(timeout)clearTimeout(timeout)
    candidate.removeListener('ready-to-show',onReady)
  }
}
function openDashboard(tab = 'home'): void {
  dashboard.show(); dashboard.focus(); dashboard.webContents.send('navigate', tab)
}
function trayMenu(): void {
  const t = translator(snapshot.settings.language)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t('현재 펫 · 사용량'), click: () => openDashboard() },
    { label: snapshot.settings.inBall ? t('볼에서 꺼내기') : t('볼에 넣기'), enabled: activePet(snapshot.game).phase > 0, click: () => void request('settings', { inBall: !snapshot.settings.inBall, visible: true }).catch(() => {}) },
    { label: snapshot.settings.visible ? t('펫 숨기기') : t('펫 보이기'), click: () => void request('settings', { visible: !snapshot.settings.visible }).catch(() => {}) },
    { label: snapshot.settings.paused ? t('다시 걷기') : t('이동 일시정지'), click: () => void request('settings', { paused: !snapshot.settings.paused }).catch(() => {}) },
    { label: t('설정'), click: () => openDashboard('settings') },
    { label: t('업적 · 볼 컬렉션'), click: () => openDashboard('achievements') },
    { label: t('배지 · 리그 칭호'), click: () => openDashboard('league') },
    { label: updates?.state.status==='available'||updates?.state.status==='downloaded'?t('새 업데이트가 있어요'):t('업데이트 확인'),click:()=>{openDashboard('updates');void updates?.check()} },
    { label: t('펫 입력 복구'), click: () => controller.repairInput() },
    { label: t('입력 문제 시점 기록'), click: () => diagnostics.record('user.mark',controller.inputState) },
    { label: t('입력 진단 로그 폴더'), click: () => { diagnostics.record('diagnostic.folder-opened',controller.inputState); void diagnostics.flush().then(()=>shell.openPath(join(app.getPath('userData'),'diagnostics'))) } },
    { type: 'separator' }, { label: t('종료'), click: () => app.quit() }
  ]))
}
function validatePatch(value: unknown): Partial<Settings> {
  if (!value || typeof value !== 'object') throw new Error('잘못된 설정')
  const p = value as Record<string, unknown>, result: Partial<Settings> = {}
  for (const key of ['visible', 'paused', 'autoStart', 'inBall'] as const) if (key in p) { if (typeof p[key] !== 'boolean') throw new Error('잘못된 설정'); result[key] = p[key] }
  if ('pace' in p) { if (!['fast', 'normal', 'slow'].includes(String(p.pace))) throw new Error('잘못된 속도'); result.pace = p.pace as Settings['pace'] }
  if ('language' in p) { if (!isLanguage(p.language)) throw new Error('잘못된 언어 설정입니다.'); result.language=p.language }
  if ('dexSort' in p) { if (!isDexSort(p.dexSort)) throw new Error('잘못된 도감 정렬입니다.'); result.dexSort=p.dexSort }
  if ('theme' in p) { if (!isTheme(p.theme)) throw new Error('잘못된 화면 테마'); result.theme = p.theme }
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
    diagnostics = new InputDiagnostics(join(app.getPath('userData'),'diagnostics'))
    diagnostics.record('session.start',{version:app.getVersion(),platform:process.platform,arch:process.arch,electron:process.versions.electron,chrome:process.versions.chrome})
    sprites = new SpriteCache(join(app.getPath('userData'), 'sprites'), undefined, join(__dirname, '../renderer/sprites'))
    const loginStart=new LoginStart(app,process.platform,app.isPackaged,app.getPath('exe'),app.getAppPath(),process.env.PORTABLE_EXECUTABLE_FILE,process.env.POKETOKEN_TEST_MODE==='1')
    let loginRestored=false
    preferences = { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    dashboard = new BrowserWindow({ width: 1040, height: 800, minWidth: 850, minHeight: 680, show: false, backgroundColor: '#f6f7f2', autoHideMenuBar: true, title: 'PokeToken Desktop', webPreferences: preferences })
    pet = createPetWindow()
    if(process.platform==='darwin')app.dock?.hide()
    controller = new PetController(pet, snapshot.settings, id => {
      if (!quitting && worker && snapshot.settings.displayId !== id) void request('settings', { displayId: id }).catch(() => {})
    },(event,data)=>diagnostics.record(event,data),process.platform==='win32'?replacePetWindow:undefined)
    // Generic interaction smoke tests remain deterministic; the window-specific
    // smoke test explicitly enables the real native scanner in its isolated app.
    startWindowTracker(pet)
    const trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAFUlEQVR4nGNgGAWjYBSMglEwCkbBAAAGGAAB7e3H/QAAAABJRU5ErkJggg==')
    // Tray icon generated from our own egg drawing.
    const icon = nativeImage.createFromPath(join(__dirname, '../../build/tray.png'))
    const menuIcon = (icon.isEmpty() ? trayIcon : icon).resize({ width: process.platform === 'darwin' ? 18 : 24, height: process.platform === 'darwin' ? 18 : 24 })
    if (process.platform === 'darwin') menuIcon.setTemplateImage(true)
    tray = new Tray(menuIcon)
    tray.setToolTip('PokeToken Desktop'); tray.on('click', () => openDashboard()); trayMenu()
    dashboard.on('close', event => { if (!quitting) { event.preventDefault(); dashboard.hide() } })
    dashboard.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    dashboard.webContents.on('will-navigate', event => event.preventDefault())
    dashboard.once('ready-to-show', () => { if (!process.argv.includes('--hidden') && !app.getLoginItemSettings().wasOpenedAtLogin) dashboard.show() })
    pet.webContents.on('did-finish-load', () => controller.apply(snapshot.settings))
    const pagesReady=Promise.all([load(dashboard,'dashboard'),load(pet,'pet')])
    worker = new Worker(join(__dirname, 'worker.js'), { workerData: { path: join(app.getPath('userData'), 'poketoken.sqlite') } })
    const workerReady=new Promise<void>(resolve=>{const ready=(message:{type:string}):void=>{if(message.type==='snapshot'){worker.removeListener('message',ready);resolve()}};worker.on('message',ready)})
    void Promise.all([pagesReady,workerReady]).then(()=>portableUpdateStarted()).catch(()=>{})
    updates=createUpdates(state=>{if(quitting)return;if(!dashboard.isDestroyed())dashboard.webContents.send('update:state',state);if(!tray.isDestroyed())trayMenu()},async()=>{await request('refresh');await request('flush')})
    worker.on('message', message => {
      if (message.type === 'snapshot') {
        snapshot = message.value
        if(!loginRestored){loginRestored=true;try{loginStart.restore(snapshot.settings.autoStart)}catch{snapshot.startup='error'}}
        snapshot.startup=snapshot.startup??loginStart.read()
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
      const previous=snapshot.settings.autoStart
      if(patch.autoStart!==undefined)loginStart.set(patch.autoStart)
      try{await request('settings',patch)}catch(error){if(patch.autoStart!==undefined)try{loginStart.set(previous)}catch{}throw error}
    })
    ipcMain.handle('usage:refresh', async event => { allowed(event); await request('refresh') })
    ipcMain.handle('folder:choose', async (event, provider) => { allowed(event); if (!['claude', 'codex'].includes(provider)) return null; const result = await dialog.showOpenDialog(dashboard, { title: translator(snapshot.settings.language)('로그 폴더 선택'), properties: ['openDirectory'] }); return result.canceled ? null : result.filePaths[0] })
    ipcMain.handle('display:list', event => { allowed(event); const t = translator(snapshot.settings.language); return screen.getAllDisplays().map((d, i) => ({ id: String(d.id), label: `${d.label || t`화면 ${i + 1}`} · ${d.size.width} × ${d.size.height}${d.id === screen.getPrimaryDisplay().id ? t(' (기본)') : ''}` })) })
    ipcMain.handle('sprite:get', (event, id, shiny) => { allowed(event); return sprites.get(id,shiny === true) })
    ipcMain.handle('game:action', async (event, value) => {
      allowed(event)
      if (event.sender.id !== dashboard.webContents.id || !value || typeof value !== 'object') throw new Error('잘못된 요청')
      let action: GameAction
      if(value.type==='auto-hatch')action={type:'auto-hatch',config:value.config===null?null:validateAutoHatchConfig(value.config)}
      else if (value.type === 'egg' && EGG_TYPES.some(t=>t.id===value.eggType)) action={type:'egg',eggType:value.eggType}
      else if (value.type === 'select' && typeof value.petId==='string' && value.petId.length<80 && Number.isInteger(value.phase) && value.phase>=0 && value.phase<=3) action={type:'select',petId:value.petId,phase:value.phase}
      else if (value.type === 'candy' && Number.isSafeInteger(value.count) && value.count>0 && value.count<=1e9) action={type:'candy',count:value.count}
      else if (value.type === 'target' && (value.speciesId===null || Number.isInteger(value.speciesId))) action={type:'target',speciesId:value.speciesId}
      else if (value.type === 'ball' && typeof value.petId === 'string' && value.petId.length < 80 && isBall(value.ball)) action={type:'ball',petId:value.petId,ball:value.ball}
      else if(value.type==='mega-stone'&&typeof value.stone==='string'&&value.stone.length<80)action={type:'mega-stone',stone:value.stone}
      else if(value.type==='mega'&&(value.formId===null||Number.isInteger(value.formId))&&(value.petId===undefined||typeof value.petId==='string'&&value.petId.length<80))action={type:'mega',formId:value.formId,...(value.petId===undefined?{}:{petId:value.petId})}
      else throw new Error('잘못된 요청')
      await request('game',undefined,action)
    })
    ipcMain.handle('league:display',async(event,value)=>{
      allowed(event);if(event.sender.id!==dashboard.webContents.id||!value||!Array.isArray(value.badges)||value.badges.length>8||value.badges.some((id:unknown)=>typeof id!=='string'||id.length>100)||value.title!==null&&(typeof value.title!=='string'||value.title.length>100))throw new Error('잘못된 전시 설정입니다.')
      await request('league',undefined,undefined,{badges:value.badges,title:value.title})
    })
    ipcMain.handle('league:source',async(event,id,index)=>{
      allowed(event);if(event.sender.id!==dashboard.webContents.id||typeof id!=='string'||!Number.isInteger(index))throw new Error('잘못된 요청')
      const source=LEAGUE_BY_ID.get(id)?.parties[index]?.source
      if(!source||!source.startsWith('https://www.serebii.net/'))throw new Error('잘못된 요청')
      await shell.openExternal(source)
    })
    ipcMain.handle('update:get',event=>{allowed(event);if(event.sender.id!==dashboard.webContents.id)throw new Error('잘못된 요청');return updates!.state})
    ipcMain.handle('update:action',async(event,action)=>{allowed(event);if(event.sender.id!==dashboard.webContents.id||!['check','download','install','apply','open'].includes(action))throw new Error('잘못된 요청');await updates![action as 'check'|'download'|'install'|'apply'|'open']()})
    ipcMain.handle('dashboard:open', (event, tab) => { allowed(event); openDashboard(['home', 'dex', 'achievements', 'league', 'settings', 'updates'].includes(tab) ? tab : 'home') })
    ipcMain.on('pet:pointer', (event, active) => { if (event.sender.id === pet.webContents.id) controller.pointer(active === true) })
    let traceWindow=0,traceCount=0
    ipcMain.on('pet:input-trace',(event,value)=>{
      if (event.sender.id!==pet.webContents.id) return
      const now=Date.now();if(now-traceWindow>=1000||now<traceWindow){traceWindow=now;traceCount=0}
      if(++traceCount>200)return
      const trace=sanitizePetTrace(value)
      if(trace)diagnostics.record(`renderer.${trace.event}`,{...trace,windowId:event.sender.id,state:controller.inputState})
    })
    ipcMain.on('pet:drag', (event, action) => {
      if (event.sender.id !== pet.webContents.id || !['start', 'move', 'end', 'cancel', 'release'].includes(action)) return
      const before=action==='move'?null:controller.inputState,result=controller.drag(action)
      if(action!=='move')diagnostics.record('ipc.drag',{action,result,before,after:controller.inputState})
      if(result==='drop')void request('settings', { displayId: controller.selectedDisplay }).catch(() => {})
      if(result==='pet' && snapshot.settings.inBall)void request('settings', { inBall: false }).catch(() => {})
    })
    ipcMain.on('pet:menu', event => { const t = translator(snapshot.settings.language); if (event.sender.id === pet.webContents.id) Menu.buildFromTemplate([
      { label: snapshot.settings.inBall ? t('볼에서 꺼내기') : t('볼에 넣기'), enabled: activePet(snapshot.game).phase > 0, click: () => void request('settings', { inBall: !snapshot.settings.inBall }).catch(() => {}) },
      { label: t('현재 펫 · 사용량'), click: () => openDashboard() }, { label: t('이동 일시정지 / 다시 걷기'), click: () => void request('settings', { paused: !snapshot.settings.paused }).catch(() => {}) },
      { label: t('설정'), click: () => openDashboard('settings') }, { label: t('펫 숨기기'), click: () => void request('settings', { visible: false }).catch(() => {}) }
    ]).popup({ window: pet }) })
    void request('refresh').catch(() => {})
    const scanTimer = setInterval(() => { if (!snapshot.scanning) void request('scan').catch(() => {}) }, 10_000)
    const updateStart=process.env.POKETOKEN_TEST_MODE!=='1'&&app.isPackaged?setTimeout(()=>void updates?.check(),20_000):undefined
    const updateTimer=process.env.POKETOKEN_TEST_MODE!=='1'&&app.isPackaged?setInterval(()=>void updates?.check(),6*60*60*1000):undefined
    app.on('before-quit', event => {
      if(quitting)return
      event.preventDefault();quitting=true
      diagnostics.record('session.end',controller.inputState)
      clearTimeout(updateStart);clearInterval(updateTimer)
      clearInterval(scanTimer); windowTracker?.destroy(); controller.destroy(); tray.destroy(); void worker.terminate(); for (const p of pending.values()) clearTimeout(p.timer)
      void Promise.race([diagnostics.close(),new Promise(resolve=>setTimeout(resolve,1500))]).finally(()=>app.quit())
    })
  })
  app.on('window-all-closed', () => { /* tray companion keeps running */ })
  app.on('activate', () => { if (dashboard) openDashboard() })
}
