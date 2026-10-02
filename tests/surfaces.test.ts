import { describe, expect, it } from 'vitest'
import { decodeWindowFrames, windowLedges, WindowFrame } from '../src/main/surfaces'
const back: WindowFrame = { id:'back',pid:20,x:100,y:400,width:800,height:500 }
describe('native window geometry',()=>{
  it('subtracts only the covered parts of a title edge in front-to-back order',()=>{
    const front={id:'front',pid:21,x:300,y:300,width:200,height:400}
    expect(windowLedges([front,back]).filter(l=>l.id==='back')).toEqual([
      {id:'back',x:100,y:400,width:200,frameX:100},{id:'back',x:500,y:400,width:400,frameX:100}
    ])
    expect(windowLedges([{...front,x:50,width:1000},back]).some(l=>l.id==='back')).toBe(false)
    expect(windowLedges([{...front,y:450},back]).find(l=>l.id==='back')?.width).toBe(800)
  })
  it('keeps no window titles or extra metadata, excludes the pet process and converts physical pixels to DIP',()=>{
    const own={...back,id:'own',pid:99},bad={...back,id:'bad',width:NaN}
    const frames=decodeWindowFrames(JSON.stringify([own,{...back,title:'private document'},back,bad]),99,r=>({x:r.x/2,y:r.y/2,width:r.width/2,height:r.height/2}))
    expect(frames).toEqual([{id:'back',pid:20,x:50,y:200,width:400,height:250}])
    expect(decodeWindowFrames('{partial',99)).toBeNull()
    expect(decodeWindowFrames('{}',99)).toBeNull()
    expect(decodeWindowFrames('[]',99)).toEqual([])
  })
})
