import { parentPort, workerData } from 'node:worker_threads'
import { Store } from './store'
import { Scanner } from './scanner'
import { GameAction, Settings } from '../shared/model'
import type { LeagueDisplay } from '../shared/league'
const store = new Store(workerData.path)
// Explicitly reproducible hatches for isolated desktop integration scenarios.
let testDraw = 0
const random = process.env.POKETOKEN_TEST_MODE === '1' && process.env.POKETOKEN_TEST_HATCH === 'first' ? () => testDraw++ % 2 === 0 ? 0 : .5 : Math.random
const scanner = new Scanner(store, random)
let scanning = false
const publish = (): void => { parentPort!.postMessage({ type: 'snapshot', value: { ...store.snapshot(), roots: scanner.statuses, scanning } }) }
let queue = Promise.resolve()
parentPort!.on('message', (message: { id: number; op: string; patch?: Partial<Settings>; action?: GameAction; display?:LeagueDisplay }) => {
  queue = queue.then(async () => {
    try {
      if (message.op === 'settings') store.updateSettings(message.patch!)
      if (message.op === 'league') store.updateLeague(message.display)
      if (message.op === 'flush') store.db.pragma('wal_checkpoint(FULL)')
      if (message.op === 'game') {
        // Credit pending usage to the old selection before switching/feeding.
        scanning = true; publish()
        try { await scanner.scan(true) } finally { scanning = false }
        store.act(message.action!)
      }
      if (message.op === 'scan' || message.op === 'refresh' || message.patch?.roots) {
        scanning = true; publish()
        try { await scanner.scan(message.op !== 'scan') } finally { scanning = false }
      }
      publish()
      parentPort!.postMessage({ type: 'reply', id: message.id })
    } catch (error) {
      scanning = false
      publish()
      if (!['game','settings','league','flush'].includes(message.op)) parentPort!.postMessage({ type: 'error', message: '사용량을 읽는 중 오류가 발생했습니다. 잠시 후 다시 시도합니다.' })
      parentPort!.postMessage({ type: 'reply', id: message.id, error: ['game','settings','league','flush'].includes(message.op) && error instanceof Error ? error.message : '사용량 처리 실패' })
    }
  })
})
publish()
