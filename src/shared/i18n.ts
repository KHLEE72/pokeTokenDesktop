import catalog from './localized-catalog.json'
import messages from './messages.json'
import type { EggType } from './catalog'
import type { BallId, ThemeId } from './rewards'

export type Language = 'ko' | 'en' | 'ja'
export const LANGUAGES: { id: Language; name: string }[] = [{ id: 'ko', name: '한국어' }, { id: 'en', name: 'English' }, { id: 'ja', name: '日本語' }]
export const isLanguage = (value: unknown): value is Language => LANGUAGES.some(item => item.id === value)
export const localeFor = (language: Language): string => ({ ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' })[language]
type Names = Record<string, Record<Language, string>>
export const pokemonName = (id: number, language: Language): string => (catalog.species as Names)[String(id)]?.[language] ?? 'Pokémon'
export const typeName = (id: EggType, language: Language): string => (catalog.types as Names)[id][language]
export const ballName = (id: BallId = 'poke', language: Language): string => (catalog.balls as Names)[id][language]
export function themeName(id: ThemeId, language: Language): string {
  if (id === 'light') return { ko: '몬스터볼 라이트', en: 'Poké Ball Light', ja: 'モンスターボール・ライト' }[language]
  if (id === 'dark') return { ko: '보라시티 다크', en: 'Lavender Town Dark', ja: 'シオンタウン・ダーク' }[language]
  return ballName(id, language)
}
export const pokemonMatches = (id: number, query: string): boolean => Object.values((catalog.species as Names)[String(id)] ?? {}).some(name => name.normalize('NFKC').replace(/\s/g, '').toLowerCase().includes(query))
export function translate(key: string, language: Language, values: unknown[] = []): string {
  const template = language === 'ko' ? key : (messages as Record<string, { en: string; ja: string }>)[key]?.[language] ?? key
  return template.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ''))
}
export function translator(language: Language): (key: string | TemplateStringsArray, ...values: unknown[]) => string {
  return (key, ...values) => typeof key === 'string' ? translate(key, language, values) : translate(key.reduce((result, part, i) => result + (i ? `{${i - 1}}` : '') + part, ''), language, values)
}
export function eggName(type: EggType | null, language: Language): string {
  const t = translator(language)
  return type ? t`${typeName(type, language)} 알` : t('기존 알')
}

// Older saves contain Korean notices. Translate the fixed message grammar at
// presentation time so switching language never rewrites game/usage records.
export function localizeMessage(message: string | null | undefined, language: Language): string {
  if (!message || language === 'ko') return message ?? ''
  const t = translator(language)
  const exact = translate(message, language)
  if (exact !== message) return exact
  if(message === '프레미어볼을 골랐어요.') return t`${ballName('premier',language)}을 골랐어요.`
  const candy = /^사탕 ([\d,]+) XP 사용(?: · (.*))?$/.exec(message)
  if (candy) return t`사탕 ${Number(candy[1].replace(/,/g, '')).toLocaleString(localeFor(language))} XP 사용` + (candy[2] ? ` · ${localizeMessage(candy[2], language)}` : '')
  for (const [id, names] of Object.entries(catalog.species)) if (message === `${names.ko}를 목표로 키워요.`) return t`${pokemonName(Number(id), language)}를 목표로 키워요.`
  for (const [id, names] of Object.entries(catalog.balls)) if (message === `${names.ko}을 골랐어요.`) return t`${ballName(id as BallId, language)}을 골랐어요.`
  return message.split(' · ').map(part => {
    const hatch = /^(이로치 )?부화 (\d+)회$/.exec(part)
    if (hatch) return hatch[1] ? t`이로치 부화 ${hatch[2]}회` : t`부화 ${hatch[2]}회`
    const evolution = /^진화 (\d+)회$/.exec(part)
    return evolution ? t`진화 ${evolution[1]}회` : translate(part, language)
  }).join(' · ')
}
