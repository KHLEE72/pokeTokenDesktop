import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { Store } from '../src/main/store'
import { advanceGame } from '../src/shared/game'
import { POKEMON, EGG_TYPES } from '../src/shared/catalog'
import { BALLS, THEMES, ACHIEVEMENTS } from '../src/shared/rewards'
import { ballName, eggName, isLanguage, LANGUAGES, localeFor, localizeMessage, pokemonMatches, pokemonName, themeName, translate, translator } from '../src/shared/i18n'
import messages from '../src/shared/messages.json'
import catalog from '../src/shared/localized-catalog.json'
import ballSources from '../src/renderer/src/assets/balls/sources.json'
import { localizedDialogue } from '../src/shared/localized-dialogue'
import { DialogueDirector, DialogueEvent, pickDialogue } from '../src/shared/dialogue'
import { removeTestDirectory } from './temp'

const stores: Store[] = [], directories: string[] = []
afterEach(() => { for (const s of stores.splice(0)) if (s.db.open) s.close(); for (const d of directories.splice(0)) removeTestDirectory(d) })
describe('official localized names and offline translations', () => {
  it('bundles complete official names by species/type/item identifier, not Korean transliterations', () => {
    expect(Object.keys(catalog.species)).toHaveLength(POKEMON.length)
    expect(Object.keys(catalog.types)).toHaveLength(EGG_TYPES.length)
    expect(Object.keys(catalog.balls)).toHaveLength(BALLS.length)
    for (const language of LANGUAGES.map(l => l.id)) {
      for (const p of POKEMON) expect(pokemonName(p.id, language)).toBeTruthy()
      for (const id of THEMES.map(t => t.id)) expect(themeName(id, language)).toBeTruthy()
    }
    expect(pokemonName(1, 'en')).toBe('Bulbasaur'); expect(pokemonName(1, 'ja')).toBe('フシギダネ')
    expect(pokemonName(133, 'ja')).toBe('イーブイ'); expect(pokemonName(700, 'en')).toBe('Sylveon')
    expect(ballName('luxury', 'ja')).toBe('ゴージャスボール'); expect(ballName('great', 'en')).toBe('Great Ball')
    expect(eggName('psychic', 'ja')).toBe('エスパータイプのタマゴ')
    expect(eggName('grass', 'en')).toBe('Grass-type Egg')
    expect(localeFor('ja')).toBe('ja-JP'); expect(isLanguage('fr')).toBe(false)
  })
  it('matches each language and case-normalized official aliases for dex search', () => {
    expect(pokemonMatches(1, 'bulba')).toBe(true); expect(pokemonMatches(1, 'フシギダネ')).toBe(true)
    expect(pokemonMatches(133, '이브이')).toBe(true); expect(pokemonMatches(700, 'sylveon')).toBe(true)
    expect(pokemonMatches(1, 'eevee')).toBe(false)
  })
  it('keeps every interpolation and reward description translated', () => {
    for (const [key, translations] of Object.entries(messages)) for (const language of ['en', 'ja'] as const) {
      expect(translations[language].match(/\{\d+\}/g)?.sort() ?? [],key).toEqual(key.match(/\{\d+\}/g)?.sort() ?? [])
      expect(translations[language],key).not.toMatch(/[가-힣]/)
    }
    for (const a of ACHIEVEMENTS) for (const language of ['en', 'ja'] as const) for (const key of [a.title,a.description,a.unit]) expect(translate(key,language)).not.toMatch(/[가-힣]/)
    const t = translator('ja'); expect(t`${'くさ'} 알`).toBe('くさのタマゴ')
    expect(translator('en')('unchanged')).toBe('unchanged')
  })
  it('localizes legacy persisted notices without touching the original message', () => {
    const notices = ['이로치 부화 1회 · 진화 2회', '사탕 100,000 XP 사용 · 진화 1회', '님피아를 목표로 키워요.', '럭셔리볼을 골랐어요.', '진화 준비 완료 · 목표를 골라주세요. 새 토큰은 사탕으로 쌓입니다.', '알을 선택했어요. 이전 친구의 성장 상태는 보관됩니다.']
    for (const notice of notices) for (const language of ['en', 'ja'] as const) expect(localizeMessage(notice,language)).not.toMatch(/[가-힣]/)
    expect(localizeMessage('님피아를 목표로 키워요.','en')).toBe('Growing toward Sylveon.')
    expect(localizeMessage('럭셔리볼을 골랐어요.','ja')).toBe('ゴージャスボールを選びました。')
    expect(localizeMessage('프레미어볼을 골랐어요.','en')).toBe('Selected Premier Ball.')
    expect(localizeMessage(null,'en')).toBe('')
  })
  it('offers three contextual lines for every species and egg in both added languages', () => {
    const events: DialogueEvent[] = ['idle','held','falling','landing','growth','usage','petting']
    for (const language of ['en','ja'] as const) for (const id of [null,...POKEMON.map(p=>p.id)]) for (const event of events) {
      const lines=localizedDialogue(id,event,language)
      expect(new Set(lines).size).toBe(3)
      expect(lines.join(' ')).not.toMatch(/[가-힣]/)
      const first=pickDialogue(id,event,undefined,()=>0,language)
      expect(pickDialogue(id,event,first,()=>0,language)).not.toBe(first)
    }
    const director=new DialogueDirector(()=>0,()=>100)
    expect(director.say(1,'petting',null,'en')?.text).toContain('bulb')
    expect(director.say(133,'petting',null,'ja')?.text).toContain('えり')
  })
  it('ships seven unchanged 160px PNGs with recorded provenance and alpha', () => {
    for(const ball of BALLS) {
      const png=readFileSync(`src/renderer/src/assets/balls/${ball.id}.png`)
      expect(png.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a')
      expect(png.readUInt32BE(16)).toBe(160);expect(png.readUInt32BE(20)).toBe(160)
      expect(png[25]).toBe(6)
      expect(createHash('sha256').update(png).digest('hex')).toBe(ballSources.sources[ball.id].sha256)
    }
  })
})
describe('persisted language setting', () => {
  it('defaults to English and remembers each chosen language and sort order across reopening older saves', () => {
    const directory=mkdtempSync(join(tmpdir(),'poketoken-preferences-'));directories.push(directory)
    const path=join(directory,'test.sqlite');let store=new Store(path);stores.push(store)
    expect(store.settings.language).toBe('en');expect(store.settings.dexSort).toBe('number')
    for(const language of ['ko','en','ja'] as const) {
      store.updateSettings({language,dexSort:'acquired'})
      const {dexSort:_,...legacy}=store.settings;store.set('settings',legacy)
      store.close();store=new Store(path);stores.push(store)
      expect(store.settings.language).toBe(language);expect(store.settings.dexSort).toBe('number')
      store.updateSettings({dexSort:'name',paused:true})
      store.close();store=new Store(path);stores.push(store)
      expect(store.settings.language).toBe(language);expect(store.settings.dexSort).toBe('name')
    }
    const before=store.snapshot()
    expect(()=>store.updateSettings({dexSort:'random' as never})).toThrow('정렬')
    expect(store.snapshot()).toEqual(before)
  })
  it('migrates older settings once and preserves all progress, candy, rewards and usage', () => {
    const directory=mkdtempSync(join(tmpdir(),'poketoken-language-'));directories.push(directory)
    const path=join(directory,'test.sqlite'),first=new Store(path);stores.push(first)
    const game=first.game;advanceGame(game,150_700_000,'fast',new Date().toISOString(),()=>.5);first.set('game-v2',game)
    const {language:_,...oldSettings}=first.settings;first.set('settings',{...oldSettings,theme:'dark',paused:true})
    first.close();const migrated=new Store(path);stores.push(migrated)
    expect(migrated.settings.language).toBe('en');expect(migrated.game).toEqual(game)
    const before=migrated.snapshot()
    for(const language of ['ko','ja','en'] as const) migrated.updateSettings({language})
    expect(migrated.snapshot()).toEqual(before)
    migrated.updateSettings({language:'ja'});migrated.close()
    const reopened=new Store(path);stores.push(reopened)
    expect(reopened.settings.language).toBe('ja');expect(reopened.game).toEqual(game)
    const saved=reopened.snapshot()
    expect(()=>reopened.updateSettings({language:'fr' as never})).toThrow('언어')
    expect(reopened.snapshot()).toEqual(saved)
  })
})
