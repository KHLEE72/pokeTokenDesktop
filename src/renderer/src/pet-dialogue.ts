import { useCallback, useEffect, useRef, useState } from 'react'
import { DialogueDirector, DialogueEvent, Speech } from '../../shared/dialogue'
import { speciesId } from '../../shared/game'
import { GameState, PetMotion, Snapshot } from '../../shared/model'

export function usePetDialogue(snapshot: Snapshot | null, motion: PetMotion): { speech: Speech | null; greet: () => void } {
  const director = useRef(new DialogueDirector())
  const [speech, setSpeech] = useState<Speech | null>(null)
  const current = useRef({ id: null as number | null, visible: false, ready: false, state: motion.state })
  const previousGame = useRef<GameState | null>(null)
  const nextIdle = useRef(Date.now() + 35_000 + Math.random() * 30_000)
  current.current = {
    id: snapshot ? speciesId(snapshot.game) : null,
    visible: snapshot?.settings.visible ?? false,
    ready: Boolean(snapshot?.lastScan), state: motion.state
  }
  const say = useCallback((event: DialogueEvent, summary: string | null = null): void => {
    if (!current.current.visible || !current.current.ready) return
    const next = director.current.say(current.current.id, event, summary)
    if (next) { setSpeech(next); nextIdle.current = Date.now() + 35_000 + Math.random() * 30_000 }
  }, [])

  useEffect(() => {
    if (!snapshot?.lastScan) return
    const game = snapshot.game, before = previousGame.current
    const changedSpecies = before && speciesId(before) !== speciesId(game)
    if (changedSpecies) { director.current.clear(); setSpeech(null) }
    if (!before) say(snapshot.notice ? 'growth' : 'idle', snapshot.notice)
    else if (changedSpecies || game.captures.length > before.captures.length) say('growth', snapshot.notice)
    else if (game.tokensEarned > before.tokensEarned) say('usage')
    previousGame.current = game
  }, [snapshot, say])

  useEffect(() => {
    if (motion.state === 'held' || motion.state === 'falling' || motion.state === 'landing') say(motion.state)
  }, [motion.state, say])

  useEffect(() => window.desktop.onPetting(() => say('petting')), [say])

  useEffect(() => {
    if (!snapshot?.settings.visible) { director.current.clear(); setSpeech(null) }
  }, [snapshot?.settings.visible])

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
