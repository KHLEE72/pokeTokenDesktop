import { homedir } from 'node:os'
import { resolve, join } from 'node:path'
import { Provider, Settings } from '../shared/model'
export interface ScanRoot { provider: Provider; path: string; key: string }
export function scanRoots(settings: Settings, home = homedir(), env = process.env): ScanRoot[] {
  const expand = (p: string): string => resolve(p === '~' ? home : p.startsWith('~/') || p.startsWith('~\\') ? join(home, p.slice(2)) : p)
  const defaults = env.POKETOKEN_TEST_MODE === '1' ? { claude: [], codex: [] } : {
    claude: [join(expand(env.CLAUDE_CONFIG_DIR || join(home, '.claude')), 'projects')],
    codex: [join(expand(env.CODEX_HOME || join(home, '.codex')), 'sessions'), join(expand(env.CODEX_HOME || join(home, '.codex')), 'archived_sessions')]
  }
  const roots: ScanRoot[] = [], seen = new Set<string>()
  for (const provider of ['claude', 'codex'] as const) for (const path of [...defaults[provider], ...settings.roots[provider]]) {
    const absolute = expand(path), canonical = process.platform === 'win32' ? absolute.toLowerCase() : absolute
    const key = `${provider}|${canonical}`
    if (!seen.has(key)) { seen.add(key); roots.push({ provider, path: absolute, key }) }
  }
  return roots
}
