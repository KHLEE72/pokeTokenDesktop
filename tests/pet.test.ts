import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserWindow, screen, powerMonitor } from 'electron'
import { PetController } from '../src/main/pet'
import { defaultSettings, PetMotion } from '../src/shared/model'
vi.mock('electron',async()=>{
  const {EventEmitter}=await import('node:events')
  const primary={id:1,workArea:{x:0,y:0,width:1920,height:1040}}
  const side={id:2,workArea:{x:1920,y:-300,width:1280,height:1000}}
  return {
    screen:Object.assign(new EventEmitter(),{
      getAllDisplays:vi.fn(()=>[primary,side]),getPrimaryDisplay:vi.fn(()=>primary),
      getCursorScreenPoint:vi.fn(()=>({x:0,y:0})),getDisplayMatching:vi.fn((bounds:{x:number})=>bounds.x>=1920?side:primary)
    }),powerMonitor:new EventEmitter()
  }
})
const controllers: PetController[] = []
function setup() {
  vi.useFakeTimers()
  vi.mocked(screen.getAllDisplays).mockReturnValue([screen.getPrimaryDisplay(),{id:2,workArea:{x:1920,y:-300,width:1280,height:1000}} as ReturnType<typeof screen.getPrimaryDisplay>])
  let bounds={x:0,y:0,width:176,height:208}
  const window={isDestroyed:()=>false,webContents:{send:vi.fn()},
    setBounds:vi.fn((value:typeof bounds)=>{bounds={...value}}),getBounds:()=>({...bounds}),
    setPosition:vi.fn((x:number,y:number)=>{bounds={...bounds,x,y}}),
    showInactive:vi.fn(),hide:vi.fn(),setIgnoreMouseEvents:vi.fn()
  }
  const settings=defaultSettings(),controller=new PetController(window as unknown as BrowserWindow,settings)
  controllers.push(controller)
  return {window,settings,controller,get bounds(){return bounds},get motion(){return window.webContents.send.mock.calls.at(-1)?.[1] as PetMotion}}
}
afterEach(()=>{for(const controller of controllers.splice(0))controller.destroy();vi.useRealTimers();vi.clearAllMocks()})
describe('pet desktop behavior',()=>{
  it('uses DIP work-area bounds, forwards background mouse movement and never focuses itself',()=>{
    const rig=setup()
    expect(rig.bounds.y+rig.bounds.height).toBe(1040)
    expect(rig.window.setIgnoreMouseEvents).toHaveBeenCalledWith(true,{forward:true})
    rig.controller.pointer(true);expect(rig.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false,{forward:true})
    rig.controller.pointer(false);expect(rig.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true,{forward:true})
    rig.controller.apply({...rig.settings,visible:true})
    expect(rig.window.showInactive).toHaveBeenCalled()
    rig.controller.destroy()
  })
  it('keeps the release height, accelerates downwards and lands on the destination monitor',()=>{
    const rig=setup()
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+20,y:rig.bounds.y+20})
    rig.controller.drag('start')
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:2320,y:120})
    vi.advanceTimersByTime(33)
    expect(rig.bounds.x).toBe(2300);expect(rig.bounds.y).toBe(100)
    expect(rig.motion.state).toBe('held');expect(rig.motion.tilt).toBeLessThan(0)
    rig.controller.drag('end')
    expect(rig.controller.selectedDisplay).toBe('2')
    expect(rig.bounds.y).toBe(100);expect(rig.motion.state).toBe('falling')
    vi.advanceTimersByTime(66)
    const first=rig.bounds.y;expect(first).toBeGreaterThan(100);expect(first+rig.bounds.height).toBeLessThan(700)
    vi.advanceTimersByTime(66)
    expect(rig.bounds.y-first).toBeGreaterThan(first-100)
    vi.advanceTimersByTime(600)
    expect(rig.motion.state).toBe('landing')
    expect(rig.bounds.y+rig.bounds.height).toBe(700)
    vi.advanceTimersByTime(660);expect(rig.motion.state).toBe('idle')
    rig.controller.destroy()
  })
  it('finishes falling while paused and survives snapshots confirming the drop display',()=>{
    const rig=setup()
    rig.controller.apply({...rig.settings,paused:true})
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+20,y:rig.bounds.y+20})
    rig.controller.drag('start')
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:2320,y:20})
    vi.advanceTimersByTime(33);rig.controller.drag('end')
    const y=rig.bounds.y
    rig.controller.apply({...rig.settings,paused:true,displayId:'2'})
    expect(rig.bounds.y).toBe(y);expect(rig.motion.state).toBe('falling')
    rig.controller.apply({...rig.settings,paused:true,displayId:'2',pace:'slow'})
    expect(rig.bounds.y).toBe(y)
    vi.advanceTimersByTime(2300)
    expect(rig.bounds.y+rig.bounds.height).toBe(700);expect(rig.motion.state).toBe('idle')
    const x=rig.bounds.x;vi.advanceTimersByTime(5000);expect(rig.bounds.x).toBe(x)
    rig.controller.destroy()
  })
  it('can be caught during a fall and ignores duplicate release events',()=>{
    const rig=setup()
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+20,y:rig.bounds.y+20})
    rig.controller.drag('start')
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:300,y:120})
    vi.advanceTimersByTime(33);rig.controller.drag('end');vi.advanceTimersByTime(99)
    const y=rig.bounds.y
    rig.controller.drag('end');expect(rig.bounds.y).toBe(y)
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+20,y:y+20})
    rig.controller.drag('start');vi.advanceTimersByTime(500)
    expect(rig.motion.state).toBe('held');expect(rig.bounds.y).toBe(y)
    rig.controller.drag('end');vi.advanceTimersByTime(2300)
    expect(rig.bounds.y+rig.bounds.height).toBe(1040)
    rig.controller.destroy()
  })
  it('holds immediately on a click and resumes a caught fall when the click ends',()=>{
    const rig=setup()
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+20,y:rig.bounds.y+20})
    rig.controller.drag('start');expect(rig.motion.state).toBe('held')
    const x=rig.bounds.x;vi.advanceTimersByTime(4000);expect(rig.bounds.x).toBe(x)
    rig.controller.drag('cancel');expect(rig.motion.state).toBe('idle')
    expect(rig.bounds.y+rig.bounds.height).toBe(1040)
    rig.controller.drag('start')
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:300,y:120})
    vi.advanceTimersByTime(33);rig.controller.drag('end');vi.advanceTimersByTime(99)
    const y=rig.bounds.y
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+20,y:y+20})
    rig.controller.drag('start');rig.controller.drag('cancel')
    expect(rig.motion.state).toBe('falling');expect(rig.bounds.y).toBe(y)
    vi.advanceTimersByTime(2300);expect(rig.bounds.y+rig.bounds.height).toBe(1040)
    rig.controller.destroy()
  })
  it('clamps an off-screen release and recovers a falling pet after monitor removal',()=>{
    const rig=setup()
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+20,y:rig.bounds.y+20})
    rig.controller.drag('start')
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:5000,y:-2000})
    vi.advanceTimersByTime(33);rig.controller.drag('end')
    expect(rig.bounds.x+rig.bounds.width).toBeLessThanOrEqual(3200)
    expect(rig.bounds.y).toBe(-300)
    vi.mocked(screen.getAllDisplays).mockReturnValue([screen.getPrimaryDisplay()])
    screen.emit('display-removed')
    expect(rig.motion.state).toBe('idle')
    expect(rig.bounds.x+rig.bounds.width).toBeLessThanOrEqual(1920)
    expect(rig.bounds.y+rig.bounds.height).toBe(1040)
    expect(rig.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true,{forward:true})
    rig.controller.destroy()
  })
  it('pauses movement, hides during sleep and recovers after display removal',()=>{
    const rig=setup()
    rig.controller.apply({...rig.settings,displayId:'2',paused:true})
    const x=rig.bounds.x;vi.advanceTimersByTime(500);expect(rig.bounds.x).toBe(x)
    powerMonitor.emit('suspend');expect(rig.window.hide).toHaveBeenCalled()
    powerMonitor.emit('resume');expect(rig.window.showInactive).toHaveBeenCalled()
    const primary=screen.getPrimaryDisplay()
    vi.mocked(screen.getAllDisplays).mockReturnValue([primary])
    screen.emit('display-removed')
    expect(rig.bounds.x).toBeLessThan(1920);expect(rig.bounds.y+rig.bounds.height).toBe(1040)
    rig.controller.destroy()
  })
})
