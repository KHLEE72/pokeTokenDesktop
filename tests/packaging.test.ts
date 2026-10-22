import { describe, expect, it } from 'vitest'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { getConfig } from 'app-builder-lib/out/util/config/config'
import { getFileMatchers } from 'app-builder-lib/out/fileMatcher'
const { assertPayloadSafe } = createRequire(import.meta.url)('../scripts/verify-package.cjs')

describe('packaged application allowlist', () => {
  it.each([['win', 'x64'], ['mac', 'arm64'], ['mac', 'x64']] as const)('%s %s excludes local files after electron-builder normalizes its configuration', async (platform, arch) => {
    const root = process.cwd(), output = join(root, 'release')
    const config = await getConfig(root, 'electron-builder.yml', null)
    const matchers = getFileMatchers(config, 'files', join(output, 'app'), {
      defaultSrc: root, globalOutDir: output, customBuildOptions: config[platform]!,
      macroExpander: pattern => pattern.replaceAll('${arch}', arch)
    })!
    // An exclude-only second FileSet implicitly includes the checkout. Exercise
    // the builder's real config normalization, rather than just its YAML text.
    expect(matchers).toHaveLength(1)
    const filter = matchers[0].createFilter(), file = statSync(join(root, 'package.json'))
    for (const path of ['out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html', 'build/tray.png', 'package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
      expect(filter(join(root, path), file), path).toBe(true)
    }
    for (const path of ['.env', 'README.md', 'AGENTS.md', 'src/main/store.ts', 'tests/private.jsonl', 'docs/screenshot.png', 'scripts/test.mjs', 'artifacts/private.sqlite', 'artifacts/old-build.zip', 'release/old.exe', 'build/native/helper']) {
      expect(filter(join(root, path), file), path).toBe(false)
    }
  })

  it('rejects SQLite build metadata even when a packaging filter regresses', () => {
    for (const file of ['better_sqlite3.vcxproj', 'better_sqlite3.vcxproj.filters', 'Release/obj/better_sqlite3/better_sqlite3.recipe', 'Release/obj/better_sqlite3/better_sqlite3.tlog/Cl.items.tlog']) {
      expect(() => assertPayloadSafe([`node_modules/better-sqlite3/build/${file}`], () => Buffer.alloc(0), [])).toThrow('Build-only files')
    }
  })

  it('rejects builder profile paths in plain, JSON-escaped and UTF-16 metadata without logging them', () => {
    const root = 'C:\\Users\\private-builder', file = 'out/main/index.js'
    for (const bytes of [Buffer.from(root + '\\project\\source.ts'), Buffer.from(JSON.stringify(root + '\\project')), Buffer.from(root + '\\project', 'utf16le')]) {
      let failure: Error | undefined
      try { assertPayloadSafe([file], () => bytes, [root]) } catch (error) { failure = error as Error }
      expect(failure?.message).toBe(`Local build path entered the package: ${file}`)
    }
    expect(() => assertPayloadSafe([file], () => Buffer.from('/Users/private-builder/project/source.ts'), ['/Users/private-builder'])).toThrow('Local build path')
    expect(() => assertPayloadSafe([file], () => Buffer.from('runtime uses os.homedir(); third-party credits stay intact'), [root])).not.toThrow()
  })
})
