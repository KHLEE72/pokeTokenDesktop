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
  vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:0,y:0})
  vi.mocked(screen.getAllDisplays).mockReturnValue([screen.getPrimaryDisplay(),{id:2,workArea:{x:1920,y:-300,width:1280,height:1000}} as ReturnType<typeof screen.getPrimaryDisplay>])
  let bounds={x:0,y:0,width:176,height:208}
  const window={isDestroyed:()=>false,webContents:{send:vi.fn()},
    setContentBounds:vi.fn((value:typeof bounds)=>{bounds={...value}}),getContentBounds:()=>({...bounds}),
    showInactive:vi.fn(),hide:vi.fn(),setIgnoreMouseEvents:vi.fn()
  }
  const settings=defaultSettings(),controller=new PetController(window as unknown as BrowserWindow,settings)
  controllers.push(controller)
  return {window,settings,controller,get bounds(){return bounds},get motion(){return window.webContents.send.mock.calls.filter(([channel])=>channel==='pet:motion').at(-1)?.[1] as PetMotion}}
}
afterEach(()=>{for(const controller of controllers.splice(0))controller.destroy();vi.useRealTimers();vi.clearAllMocks()})
describe('pet desktop behavior',()=>{
  it('uses a native DIP threshold for petting and never treats a cancelled capture as a click',()=>{
    const rig=setup();rig.controller.apply({...rig.settings,paused:true})
    const cursor={x:rig.bounds.x+80,y:rig.bounds.y+110}
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue(cursor)
    rig.controller.drag('start')
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({...cursor,x:cursor.x+3})
    expect(rig.controller.drag('release')).toBe('pet')
    expect(rig.window.webContents.send).toHaveBeenCalledWith('pet:petting')
    expect(rig.motion.state).toBe('idle')
    rig.window.webContents.send.mockClear()
    rig.controller.drag('start');rig.controller.drag('cancel')
    expect(rig.window.webContents.send).not.toHaveBeenCalledWith('pet:petting')
    expect(rig.controller.drag('release')).toBeNull()
  })
  it('remembers a drag that returns to its starting point rather than emitting petting',()=>{
    const rig=setup();const cursor={x:rig.bounds.x+80,y:rig.bounds.y+110}
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue(cursor);rig.controller.drag('start')
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({...cursor,x:cursor.x+10});rig.controller.drag('move')
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue(cursor)
    expect(rig.controller.drag('release')).toBe('drop')
    expect(rig.window.webContents.send).not.toHaveBeenCalledWith('pet:petting')
  })
  it('finishes a cancelled drag on its new monitor instead of retaining the old floor',()=>{
    const rig=setup()
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+80,y:rig.bounds.y+110});rig.controller.drag('start')
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:2400,y:400})
    expect(rig.controller.drag('cancel')).toBe('drop')
    vi.advanceTimersByTime(1600)
    expect(rig.controller.selectedDisplay).toBe('2')
    expect(rig.bounds.y+rig.bounds.height).toBe(700)
    expect(rig.window.webContents.send).not.toHaveBeenCalledWith('pet:petting')
  })
  it.each([1,1.25,1.5,2])('keeps the viewport and floor stable across unequal monitors at scale %s',scaleFactor=>{
    const rig=setup()
    const primary={id:1,scaleFactor,workArea:{x:0,y:0,width:Math.round(1920/scaleFactor),height:Math.round(1040/scaleFactor)}} as ReturnType<typeof screen.getPrimaryDisplay>
    const side={id:2,scaleFactor:1.5,workArea:{x:-1706,y:-300,width:1706,height:900}} as ReturnType<typeof screen.getPrimaryDisplay>
    vi.mocked(screen.getAllDisplays).mockReturnValue([primary,side])
    rig.controller.apply({...rig.settings,paused:true,displayId:'1'})
    for(const display of [side,primary,side,primary]) {
      const area=display.workArea
      for(let i=0;i<12;i++) {
        vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+80,y:rig.bounds.y+110})
        rig.controller.drag('start')
        vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:area.x+400+i*3,y:area.y+area.height+200})
        rig.controller.drag('release');vi.advanceTimersByTime(800)
        expect(rig.controller.selectedDisplay).toBe(String(display.id))
        expect(rig.bounds.width).toBe(176);expect(rig.bounds.height).toBe(208)
        expect(rig.bounds.y+rig.bounds.height).toBe(area.y+area.height)
        expect(rig.bounds.x).toBeGreaterThanOrEqual(area.x)
        expect(rig.bounds.x+rig.bounds.width).toBeLessThanOrEqual(area.x+area.width)
      }
    }
  })
  it('selects the pointer monitor even when most of the speech viewport overlaps a taller neighbour',()=>{
    const rig=setup()
    const primary={id:1,scaleFactor:1.25,workArea:{x:0,y:0,width:1536,height:832}} as ReturnType<typeof screen.getPrimaryDisplay>
    const side={id:2,scaleFactor:1.5,workArea:{x:1536,y:-720,width:1280,height:1440}} as ReturnType<typeof screen.getPrimaryDisplay>
    vi.mocked(screen.getAllDisplays).mockReturnValue([primary,side])
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+80,y:rig.bounds.y+110});rig.controller.drag('start')
    // Cursor and feet are on the primary; the bubble extends above it and
    // overlaps the taller side screen. Whole-window matching would choose side.
    vi.mocked(screen.getDisplayMatching).mockReturnValue(side)
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:1524,y:10});rig.controller.drag('release')
    vi.advanceTimersByTime(1500)
    expect(rig.controller.selectedDisplay).toBe('1');expect(rig.bounds.y+rig.bounds.height).toBe(832)
  })
  it('drops onto the shorter monitor when feet extend below it, including its taskbar',()=>{
    const rig=setup()
    const primary={id:1,scaleFactor:1.25,workArea:{x:0,y:0,width:1536,height:1000},bounds:{x:0,y:0,width:1536,height:1040}} as ReturnType<typeof screen.getPrimaryDisplay>
    const side={id:2,scaleFactor:1.5,workArea:{x:1536,y:0,width:1280,height:680},bounds:{x:1536,y:0,width:1280,height:720}} as ReturnType<typeof screen.getPrimaryDisplay>
    vi.mocked(screen.getAllDisplays).mockReturnValue([primary,side])
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+80,y:rig.bounds.y+110});rig.controller.drag('start')
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:1538,y:700})
    rig.controller.drag('release');vi.advanceTimersByTime(1000)
    expect(rig.controller.selectedDisplay).toBe('2')
    expect(rig.bounds.y+rig.bounds.height).toBe(680)
  })
  it('repairs a delayed native DPI resize and floor offset while autonomous movement is paused',()=>{
    const rig=setup();rig.controller.apply({...rig.settings,paused:true})
    const expected={...rig.bounds}
    // Simulate an OS resize after the app already placed the window.
    rig.window.setContentBounds({...expected,width:expected.width+44,height:expected.height+52,y:expected.y+12})
    vi.advanceTimersByTime(33)
    expect(rig.bounds).toEqual(expected)
    expect(rig.bounds.y+rig.bounds.height).toBe(1040)
    expect(rig.motion.state).toBe('idle')
  })
  const frame={id:'fixture',pid:88,x:250,y:500,width:700,height:350}
  function perch(rig:ReturnType<typeof setup>,feet=380):void {
    rig.controller.apply({...rig.settings,paused:true})
    rig.controller.updateSurfaces([frame])
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+20,y:rig.bounds.y+20})
    rig.controller.drag('start')
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:420,y:feet-rig.bounds.height+6+20})
    vi.advanceTimersByTime(33);rig.controller.drag('end');vi.advanceTimersByTime(1400)
    expect(rig.motion.surfaceId).toBe('fixture')
    expect(rig.bounds.y+rig.bounds.height-6).toBe(500)
  }
  it('lands on a real ledge before the desktop floor and forgives a drop just below the edge',()=>{
    const rig=setup();perch(rig,520)
    expect(rig.motion.state).toBe('idle')
    rig.controller.apply({...rig.settings,paused:true,displayId:'1'})
    expect(rig.bounds.y+rig.bounds.height-6).toBe(500)
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+20,y:rig.bounds.y+20})
    rig.controller.drag('start');rig.controller.drag('cancel')
    expect(rig.motion.state).toBe('idle');expect(rig.motion.surfaceId).toBe('fixture')
  })
  it('follows a moved/resized window while paused and preserves attachment when size changes',()=>{
    const rig=setup();perch(rig)
    rig.controller.updateSurfaces([{...frame,x:600,y:420,width:200}])
    expect(rig.bounds.y+rig.bounds.height-6).toBe(420)
    expect(rig.bounds.x+24+128).toBeLessThanOrEqual(800)
    rig.controller.apply({...rig.settings,paused:true,size:192})
    expect(rig.motion.surfaceId).toBe('fixture')
    expect(rig.bounds.y+rig.bounds.height-6).toBe(420)
    expect(rig.bounds.x+24).toBeGreaterThanOrEqual(600)
    expect(rig.bounds.x+24+192).toBeLessThanOrEqual(800)
  })
  it('walks and turns within the supported title edge',()=>{
    const rig=setup();perch(rig)
    vi.spyOn(Math,'random').mockReturnValue(0)
    rig.controller.apply({...rig.settings,paused:false})
    rig.window.setContentBounds.mockClear()
    vi.advanceTimersByTime(65000)
    expect(rig.window.setContentBounds.mock.calls.length).toBeGreaterThan(100)
    for(const [{x,y}] of rig.window.setContentBounds.mock.calls) {
      expect(x+24).toBeGreaterThanOrEqual(frame.x)
      expect(x+24+128).toBeLessThanOrEqual(frame.x+frame.width)
      expect(y+208-6).toBe(frame.y)
    }
    expect(rig.window.webContents.send.mock.calls.some(([,motion])=>motion?.direction===-1)).toBe(true)
    vi.mocked(Math.random).mockRestore()
  })
  it('drops when the supporting window is hidden, too narrow or covered',()=>{
    const rig=setup();perch(rig)
    rig.controller.updateSurfaces([{id:'cover',pid:89,x:350,y:300,width:300,height:500},frame])
    expect(rig.motion.state).toBe('falling');expect(rig.motion.surfaceId).toBeNull()
    vi.advanceTimersByTime(2200);expect(rig.bounds.y+rig.bounds.height).toBe(1040)
    perch(rig);rig.controller.updateSurfaces([{...frame,width:100}])
    expect(rig.motion.state).toBe('falling')
    vi.advanceTimersByTime(2200)
    perch(rig);rig.controller.updateSurfaces([])
    expect(rig.motion.state).toBe('falling')
    vi.advanceTimersByTime(2200);expect(rig.bounds.y+rig.bounds.height).toBe(1040)
  })
  it('follows the owner to another monitor and releases attachment on session recovery',()=>{
    const rig=setup();perch(rig)
    rig.controller.updateSurfaces([{...frame,x:2300,y:200}])
    expect(rig.controller.selectedDisplay).toBe('2')
    expect(rig.bounds.y+rig.bounds.height-6).toBe(200)
    expect(rig.bounds.x).toBeGreaterThanOrEqual(1920)
    rig.controller.apply({...rig.settings,paused:true,displayId:'2'})
    expect(rig.bounds.y+rig.bounds.height-6).toBe(200)
    powerMonitor.emit('lock-screen');powerMonitor.emit('unlock-screen')
    expect(rig.motion.surfaceId).toBeNull();expect(rig.bounds.y+rig.bounds.height).toBe(700)
  })
  it('detects a stationary cursor on the character without renderer enter/leave events, including while paused',()=>{
    const rig=setup()
    for (const size of [96,128,192] as const) {
      rig.controller.apply({...rig.settings,size,paused:true})
      vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+24+size/2,y:rig.bounds.y+rig.bounds.height-6-size/2})
      vi.advanceTimersByTime(33)
      expect(rig.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false,{forward:true})
      // Speech and the transparent margin must still pass clicks through.
      vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+80,y:rig.bounds.y+20})
      vi.advanceTimersByTime(33)
      expect(rig.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true,{forward:true})
      vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+10,y:rig.bounds.y+rig.bounds.height-20})
      vi.advanceTimersByTime(33)
      expect(rig.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true,{forward:true})
    }
  })
  it('restores grabbing after unlock even if the cursor has not left the character',()=>{
    const rig=setup()
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+80,y:rig.bounds.y+110})
    rig.controller.pointer(true)
    powerMonitor.emit('lock-screen')
    expect(rig.window.hide).toHaveBeenCalled()
    rig.controller.pointer(true)
    expect(rig.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true,{forward:true})
    powerMonitor.emit('unlock-screen')
    expect(rig.window.showInactive).toHaveBeenCalled()
    expect(rig.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false,{forward:true})
    rig.controller.drag('start');expect(rig.motion.state).toBe('held')
  })
  it('cancels a held pointer on lock and clears renderer capture before the next grab',()=>{
    const rig=setup()
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+80,y:rig.bounds.y+110})
    rig.controller.drag('start');expect(rig.motion.state).toBe('held')
    powerMonitor.emit('lock-screen')
    expect(rig.motion.state).toBe('idle')
    expect(rig.window.webContents.send).toHaveBeenCalledWith('pet:reset-interaction')
    rig.controller.drag('start');expect(rig.motion.state).toBe('idle')
    powerMonitor.emit('unlock-screen')
    rig.controller.drag('start');expect(rig.motion.state).toBe('held')
  })
  it.each([
    ['lock-screen','suspend','resume','unlock-screen'],
    ['suspend','lock-screen','unlock-screen','resume']
  ])('stays hidden until both lock and sleep end (%s, %s, %s, %s)',(first,second,partial,final)=>{
    const rig=setup()
    powerMonitor.emit(first);powerMonitor.emit(second)
    rig.window.showInactive.mockClear()
    powerMonitor.emit(partial)
    expect(rig.window.showInactive).not.toHaveBeenCalled()
    powerMonitor.emit(final)
    expect(rig.window.showInactive).toHaveBeenCalled()
  })
  it('keeps a hidden pet click-through when late pointer messages or unlock arrive',()=>{
    const rig=setup()
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({x:rig.bounds.x+80,y:rig.bounds.y+110})
    rig.controller.apply({...rig.settings,visible:false})
    rig.window.showInactive.mockClear()
    rig.controller.pointer(true)
    expect(rig.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true,{forward:true})
    powerMonitor.emit('lock-screen');powerMonitor.emit('unlock-screen')
    expect(rig.window.showInactive).not.toHaveBeenCalled()
    expect(rig.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true,{forward:true})
  })
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
