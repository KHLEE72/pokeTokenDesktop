import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserWindow, screen, powerMonitor } from 'electron'
import { PetController } from '../src/main/pet'
import { defaultSettings } from '../src/shared/model'
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
function setup() {
  vi.useFakeTimers()
  let bounds={x:0,y:0,width:176,height:208}
  const window={isDestroyed:()=>false,webContents:{send:vi.fn()},
    setBounds:vi.fn((value:typeof bounds)=>{bounds={...value}}),getBounds:()=>({...bounds}),
    setPosition:vi.fn((x:number,y:number)=>{bounds={...bounds,x,y}}),
    showInactive:vi.fn(),hide:vi.fn(),setIgnoreMouseEvents:vi.fn()
  }
  const settings=defaultSettings(),controller=new PetController(window as unknown as BrowserWindow,settings)
  return {window,settings,controller,get bounds(){return bounds}}
}
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks()})
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
  it('holds the pet while dragging and lands on the destination monitor floor',()=>{
    const rig=setup()
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+20,y:rig.bounds.y+20})
    rig.controller.drag('start')
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:2320,y:120})
    vi.advanceTimersByTime(33)
    expect(rig.bounds.x).toBe(2300);expect(rig.bounds.y).toBe(100)
    rig.controller.drag('end')
    expect(rig.controller.selectedDisplay).toBe('2')
    expect(rig.bounds.y+rig.bounds.height).toBe(700)
    rig.controller.destroy()
  })
  it('pauses movement, hides during sleep and recovers after display removal',()=>{
    const rig=setup()
    rig.controller.apply({...rig.settings,displayId:'2',paused:true})
    const x=rig.bounds.x;vi.advanceTimersByTime(500);expect(rig.bounds.x).toBe(x)
    powerMonitor.emit('suspend');expect(rig.window.hide).toHaveBeenCalled()
    powerMonitor.emit('resume');expect(rig.window.showInactive).toHaveBeenCalled()
    const primary=screen.getPrimaryDisplay()
    vi.mocked(screen.getAllDisplays).mockReturnValueOnce([primary])
    screen.emit('display-removed')
    expect(rig.bounds.x).toBeLessThan(1920);expect(rig.bounds.y+rig.bounds.height).toBe(1040)
    rig.controller.destroy()
  })
})
