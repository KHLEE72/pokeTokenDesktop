import { describe, expect, it } from 'vitest'
import { CHARACTER_DATA, characterDialogue } from '../src/shared/character-dialogue'
import { POKEMON } from '../src/shared/catalog'
import { pickDialogue } from '../src/shared/dialogue'

describe('lore-based species dialogue',()=>{
  it('has researched profiles and complete context alternatives in all three languages without name-prefix filler',()=>{
    expect(Object.keys(CHARACTER_DATA.profiles)).toHaveLength(1025)
    const fingerprints=new Set<string>()
    for(const p of POKEMON){
      const profile=CHARACTER_DATA.profiles[p.id];expect(profile.signature||profile.facts.length).toBeTruthy()
      expect(Number.isFinite(profile.sourceVersion)).toBe(true)
      for(const language of ['ko','en','ja'] as const)for(const event of ['idle','held','falling','landing','growth','usage','petting'] as const){
        const lines=characterDialogue(p.id,event,language)!
        expect(new Set(lines).size).toBe(3);expect(lines.every(line=>line.length>5)).toBe(true)
        expect(lines.some(line=>line.startsWith(`${p.name},`)||line.includes('Lift '+p.name))).toBe(false)
        if(language!=='ko')expect(lines.join(' ')).not.toMatch(/[가-힣]/)
      }
      fingerprints.add(JSON.stringify(characterDialogue(p.id,'idle','ko')))
      if(p.legendary||p.mythical)expect(profile.signature).toBeTruthy()
    }
    expect(fingerprints.size).toBeGreaterThan(700)
    expect(characterDialogue(0,'idle','ko')).toBeNull()
  })
  it('uses recognizable personalities and physical interactions, with different voices along the Ralts line',()=>{
    expect(pickDialogue(54,'idle',undefined,()=>0)).toContain('머리')
    expect(pickDialogue(143,'idle',undefined,()=>0)).toContain('밥')
    expect(pickDialogue(359,'idle',undefined,()=>0)).toContain('위험을 미리')
    expect(pickDialogue(778,'held',undefined,()=>0)).toContain('천')
    expect(pickDialogue(778,'falling',undefined,()=>0)).toContain('들리지')
    expect(pickDialogue(959,'held',undefined,()=>0)).toContain('망치')
    expect(pickDialogue(376,'usage',undefined,()=>0)).toContain('연산')
    expect(CHARACTER_DATA.profiles[280].voice).toBe('shy')
    expect(CHARACTER_DATA.profiles[281].voice).toBe('performer')
    expect(CHARACTER_DATA.profiles[282].voice).toBe('guardian')
    for(const id of [81,92,129,132,201,374,778])for(const language of ['ko','en','ja'] as const){
      expect(characterDialogue(id,'falling',language)!.join(' ')).not.toMatch(/발부터|Feet first|足から/)
    }
    expect(CHARACTER_DATA.profiles[37].facts).not.toContain('ice')
    expect(CHARACTER_DATA.profiles[37].facts).not.toContain('snow')
    expect(CHARACTER_DATA.profiles[26].body).toBe('grounded')
    expect(CHARACTER_DATA.profiles[252].body).toBe('grounded')
  })
})
