import { useCallback, useEffect, useRef, useState } from 'react'
import { DialogueDirector, DialogueEvent, Speech } from '../../shared/dialogue'
import { activePet, speciesId, waitingForEvolution } from '../../shared/game'
import { GameState, PetMotion, Snapshot } from '../../shared/model'
import { Language, localizeMessage } from '../../shared/i18n'

export function usePetDialogue(snapshot: Snapshot | null, motion: PetMotion): { speech: Speech | null; greet: () => void } {
  const director = useRef(new DialogueDirector())
  const [speech, setSpeech] = useState<Speech | null>(null)
  const current = useRef({ id: null as number | null, visible: false, ready: false, waiting: false, state: motion.state, language: 'ko' as Language })
  const previousLanguage = useRef<Language>('ko')
  const previousGame = useRef<GameState | null>(null)
  const nextIdle = useRef(Date.now() + 35_000 + Math.random() * 30_000)
  current.current = {
    id: snapshot ? speciesId(snapshot.game) : null,
    language: snapshot?.settings.language ?? 'ko',
    visible: Boolean(snapshot?.settings.visible && !snapshot.settings.inBall),
    ready: Boolean(snapshot?.lastScan), waiting: snapshot ? waitingForEvolution(activePet(snapshot.game),snapshot.settings.pace) : false, state: motion.state
  }
  const say = useCallback((event: DialogueEvent, summary: string | null = null): void => {
    if (!current.current.visible || !current.current.ready) return
    const {language,waiting}=current.current
    const next = director.current.say(current.current.id, event, summary ? localizeMessage(waiting ? '진화 목표 선택 대기' : summary,language) : null,language)
    if (next) { setSpeech(next); nextIdle.current = Date.now() + 35_000 + Math.random() * 30_000 }
  }, [])

  useEffect(() => {
    if(previousLanguage.current===current.current.language)return
    previousLanguage.current=current.current.language
    director.current=new DialogueDirector();setSpeech(null);say('idle')
  }, [snapshot?.settings.language,say])

  useEffect(() => {
    if (!snapshot?.lastScan) return
    const game = snapshot.game, before = previousGame.current
    const changedSpecies = before && (speciesId(before) !== speciesId(game) || activePet(before).shiny !== activePet(game).shiny)
    const evolved = before && game.activeId === before.activeId && activePet(game).phase > activePet(before).phase
    if (changedSpecies) { director.current.clear(); setSpeech(null) }
    if (!before) say(snapshot.notice ? 'growth' : 'idle', snapshot.notice)
    else if (evolved || game.captures.length > before.captures.length) say('growth', snapshot.notice)
    else if (changedSpecies) say('idle')
    else if (game.tokensEarned > before.tokensEarned) say('usage')
    previousGame.current = game
  }, [snapshot, say])

  useEffect(() => {
    if (motion.state === 'held' || motion.state === 'falling' || motion.state === 'landing') say(motion.state)
  }, [motion.state, say])

  useEffect(() => window.desktop.onPetting(() => say('petting')), [say])

  useEffect(() => {
    if (!snapshot?.settings.visible || snapshot.settings.inBall) { director.current.clear(); setSpeech(null) }
  }, [snapshot?.settings.visible, snapshot?.settings.inBall])

  useEffect(() => {
    const timer = setInterval(() => {
      if (!director.current.current) setSpeech(value => value ? null : value)
      if (Date.now() >= nextIdle.current && ['idle', 'walking'].includes(current.current.state)) {
        nextIdle.current = Date.now() + 35_000 + Math.random() * 30_000
        say('idle')
      }
    }, 250)
    return () => clearInterval(timer)
  }, [say])
  return { speech, greet: useCallback(() => say('idle'), [say]) }
}
