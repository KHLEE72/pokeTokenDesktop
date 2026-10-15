import { describe, expect, it } from 'vitest'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { getConfig } from 'app-builder-lib/out/util/config/config'
import { getFileMatchers } from 'app-builder-lib/out/fileMatcher'

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
})
