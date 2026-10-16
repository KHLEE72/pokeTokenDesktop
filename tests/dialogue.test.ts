import { describe, expect, it } from 'vitest'
import { DIALOGUES, DialogueDirector, DialogueEvent, pickDialogue } from '../src/shared/dialogue'
import { POKEMON } from '../src/shared/model'

describe('character dialogue', () => {
  it('gives the egg and every species three alternatives and avoids the previous line', () => {
    const events: DialogueEvent[] = ['idle', 'held', 'falling', 'landing', 'growth', 'usage', 'petting']
    for (const event of events) {
      for (const id of [null, ...POKEMON.map(p => p.id)]) {
        expect(new Set(DIALOGUES[id??0][event]).size).toBe(3)
        const first = pickDialogue(id, event, undefined, () => 0)
        expect(pickDialogue(id, event, first, () => 0)).not.toBe(first)
      }
    }
  })
  it('lets a grab, drop and landing replace idle chatter without usage interrupting them', () => {
    let now = 0
    const director = new DialogueDirector(() => 0, () => now)
    expect(director.say(4, 'idle')?.event).toBe('idle')
    expect(director.say(4, 'held')?.event).toBe('held')
    expect(director.say(4, 'usage')).toBeNull()
    expect(director.say(4, 'falling')?.event).toBe('falling')
    expect(director.say(4, 'landing')?.event).toBe('landing')
    expect(director.say(4, 'idle')).toBeNull()
    now = 5001;expect(director.current).toBeNull()
    expect(director.say(4, 'growth', '진화 1회')?.summary).toBe('진화 1회')
  })
  it('throttles frequent scans and hover events, expires bubbles and avoids repeated lines', () => {
    let now = 0
    const director = new DialogueDirector(() => 0, () => now)
    const first = director.say(7, 'usage')!.text
    now = 6000;expect(director.current).toBeNull();expect(director.say(7, 'usage')).toBeNull()
    expect(director.say(7, 'idle')).not.toBeNull()
    now = 12000;expect(director.say(7, 'idle')).toBeNull()
    now = 60001;expect(director.say(7, 'usage')!.text).not.toBe(first)
    director.clear();expect(director.current).toBeNull()
  })
  it('responds to repeated petting with fresh lines while allowing the next grab to interrupt it',()=>{
    const director=new DialogueDirector(()=>0,()=>0)
    director.say(1,'held')
    const first=director.say(1,'petting')!.text
    expect(director.say(1,'petting')!.text).not.toBe(first)
    expect(director.say(1,'usage')).toBeNull()
    expect(director.say(1,'held')?.event).toBe('held')
    expect(director.say(1,'falling')?.event).toBe('falling')
  })
})
