import { createContext, useContext } from 'react'
import { Language, translator } from '../../shared/i18n'
import type { Snapshot } from '../../shared/model'

export const SnapshotContext = createContext<Snapshot | null>(null)
export const LanguageContext = createContext<Language>('ko')
export const useSnapshot = (): Snapshot | null => useContext(SnapshotContext)
export const useI18n = (): { language: Language; t: ReturnType<typeof translator> } => {
  const language = useContext(LanguageContext)
  return { language, t: translator(language) }
}
