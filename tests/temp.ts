import { existsSync, realpathSync, rmSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { tmpdir } from 'node:os'
export function removeTestDirectory(path: string): void {
  if (!existsSync(path)) return
  const target = realpathSync(path), allowed = realpathSync(tmpdir())
  const same = (a: string, b: string): boolean => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
  if (!same(dirname(target), allowed) || !basename(target).startsWith('poketoken-')) throw new Error('Refusing to remove a path outside this test’s temporary directories.')
  rmSync(target, { recursive: true, force: true })
}
