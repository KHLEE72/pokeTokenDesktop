import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync, appendFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Store } from '../src/main/store'
import { Scanner } from '../src/main/scanner'
import { scanRoots } from '../src/main/paths'
import { removeTestDirectory } from './temp'
const dirs: string[] = [], stores: Store[] = []
const oldMode = process.env.POKETOKEN_TEST_MODE
process.env.POKETOKEN_TEST_MODE = '1'
afterEach(() => { for(const s of stores.splice(0))s.close();for(const d of dirs.splice(0))removeTestDirectory(d) })
const env = { POKETOKEN_TEST_MODE: '0', CLAUDE_CONFIG_DIR: 'C:/custom-claude', CODEX_HOME: 'C:/custom-codex' }
function setup() {
  const dir=mkdtempSync(join(tmpdir(),'poketoken-scan-')); dirs.push(dir)
  const logs=join(dir,'logs'); mkdirSync(logs)
  const store=new Store(join(dir,'test.sqlite')); stores.push(store)
  store.updateSettings({roots:{claude:[logs],codex:[]}})
  return {dir,logs,store,scanner:new Scanner(store)}
}
const line = (id:string,input:number, timestamp='2000-01-01T00:00:00Z') => JSON.stringify({type:'assistant',timestamp,requestId:'r',message:{id,usage:{input_tokens:input}}})+'\n'
describe('scanner integration',()=>{
  it('uses configured homes and deduplicates extra roots',()=>{
    const {store}=setup(); const roots=scanRoots(store.settings,'C:/test-home',env)
    expect(roots[0].path.replaceAll('\\','/')).toContain('custom-claude/projects')
    expect(roots.some(r=>r.path.replaceAll('\\','/').endsWith('custom-codex/archived_sessions'))).toBe(true)
  })
  it('baselines initial logs and detects new appended usage without double credit',async()=>{
    const {logs,store,scanner}=setup(),path=join(logs,'a.jsonl')
    writeFileSync(path,line('before',100))
    await scanner.scan(true); expect(store.game.tokensEarned).toBe(0)
    appendFileSync(path,line('after',500_000,new Date(Date.now()+1000).toISOString()))
    await scanner.scan(); expect(store.game.tokensEarned).toBe(500_000)
    await scanner.scan(true); expect(store.game.tokensEarned).toBe(500_000)
    renameSync(path,join(logs,'renamed.jsonl'))
    await scanner.scan(true); expect(store.game.tokensEarned).toBe(500_000)
    expect(store.snapshot().usage.claude.all).toBe(500_100)
  })
  it('baselines a newly connected root without replaying its history',async()=>{
    const {dir,logs,store,scanner}=setup(); await scanner.scan(true)
    const extra=join(dir,'extra'); mkdirSync(extra); writeFileSync(join(extra,'x.jsonl'),line('past',500_000))
    store.updateSettings({roots:{claude:[logs,extra],codex:[]}})
    await scanner.scan(true); expect(store.game.tokensEarned).toBe(0)
    expect(store.snapshot().usage.claude.all).toBe(500_000)
  })
  it('retries a partial final line and keeps the worker operational with missing folders',async()=>{
    const {logs,store,scanner}=setup(); await scanner.scan(true)
    const path=join(logs,'partial.jsonl'), record=line('new',20,new Date(Date.now()+1000).toISOString()).trim()
    writeFileSync(path,record.slice(0,-1)); await scanner.scan(true)
    expect(store.game.tokensEarned).toBe(0)
    appendFileSync(path,'}\n'); await scanner.scan()
    expect(store.game.tokensEarned).toBe(20)
    store.updateSettings({roots:{claude:[join(logs,'missing')],codex:[]}})
    await scanner.scan(true); expect(scanner.statuses[0].state).toBe('missing')
    expect(store.snapshot().usage.claude.all).toBe(20)
  })
  it('establishes a new baseline when a removed source is reconnected',async()=>{
    const {logs,store,scanner}=setup(),path=join(logs,'a.jsonl'); writeFileSync(path,line('past',1))
    await scanner.scan(true)
    store.updateSettings({roots:{claude:[],codex:[]}});await scanner.scan(true)
    appendFileSync(path,line('disconnected',500_000,new Date(Date.now()+1000).toISOString()))
    store.updateSettings({roots:{claude:[logs],codex:[]}});await scanner.scan(true)
    expect(store.game.tokensEarned).toBe(0);expect(store.snapshot().usage.claude.all).toBe(500_001)
  })
})
// This suite is isolated in its own test module; no live user logs are read.
void oldMode
