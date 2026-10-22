const { readFileSync, readdirSync } = require('node:fs')
const { join, normalize } = require('node:path')
const { createHash } = require('node:crypto')
const { Arch } = require('builder-util')
const asar = require('@electron/asar')

// Validate the completed payload on the actual target OS/architecture. This
// inspects the package only; development dependencies and user data stay intact.
module.exports = function verifyPackage(context) {
  const platform = context.electronPlatformName, architecture = Arch[context.arch]
  const resources = context.packager.getResourcesDir(context.appOutDir)
  const archive = join(resources, 'app.asar')
  const files = asar.listPackage(archive).map(path => path.replaceAll('\\', '/').replace(/^\//, ''))
  const allowedRoots = new Set(['out', 'node_modules', 'build', 'package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md'])
  const unexpected = files.filter(path => !allowedRoots.has(path.split('/')[0]) || path.startsWith('build/') && path !== 'build/tray.png')
  if (unexpected.length) throw new Error(`Development or local files entered the package: ${unexpected.slice(0, 5).join(', ')}`)
  const expected = `node_modules/better-sqlite3/prebuilds/${platform}-${architecture}.node`
  const addons = files.filter(path => /^node_modules\/better-sqlite3\/prebuilds\/[^/]+\.node$/.test(path))
  if (addons.length !== 1 || addons[0] !== expected) throw new Error(`Incorrect SQLite addon selection: ${addons.join(', ')}; expected ${expected}`)
  const packagedAddon = readFileSync(join(resources, 'app.asar.unpacked', expected))
  if (!packagedAddon.equals(readFileSync(join(context.packager.projectDir, expected)))) throw new Error('Packaged SQLite addon differs from the target prebuild')
  const unwanted = files.filter(path => /^node_modules\/better-sqlite3\/(deps\/|src\/|binding\.gyp$)/.test(path) || /^node_modules\/node-addon-api\/(tools\/|.*\.(h|c|gyp|gypi)$)/.test(path))
  if (unwanted.length) throw new Error(`Build-only files remain in the package: ${unwanted.slice(0, 5).join(', ')}`)
  for (const path of ['out/main/index.js', 'out/main/worker.js', 'out/preload/index.js', 'out/renderer/index.html', 'out/renderer/sprites/940.gif', 'out/renderer/sprites/940-shiny.gif', 'out/renderer/licenses/Extra-sprite-credits.txt', 'out/renderer/licenses/PokeRogue-CC-BY-NC-SA-4.0.txt', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'node_modules/better-sqlite3/LICENSE', 'node_modules/node-addon-api/LICENSE.md', 'node_modules/electron-updater/LICENSE', 'node_modules/semver/LICENSE']) {
    if (!asar.extractFile(archive, normalize(path)).length) throw new Error(`Missing runtime file or license: ${path}`)
  }
  const extra = JSON.parse(readFileSync(join(context.packager.projectDir, 'src/shared/extra-sprite-catalog.json'), 'utf8'))
  for (const p of extra.pokemon) for (const variant of ['normal', 'shiny']) {
    const sprite = p[variant]
    if (!sprite?.url.startsWith('bundled:')) continue
    const bytes = asar.extractFile(archive, normalize('out/renderer/sprites/' + sprite.url.slice('bundled:'.length)))
    if (createHash('sha256').update(bytes).digest('hex') !== sprite.sha256) throw new Error(`Missing or stale bundled sprite: ${p.id}:${variant}`)
  }
  const credit = 'out/renderer/licenses/EBDX-sprite-credits.txt'
  if (!asar.extractFile(archive, normalize(credit)).equals(readFileSync(join(context.packager.projectDir, 'src/renderer/public/licenses/EBDX-sprite-credits.txt')))) throw new Error('Missing or stale EBDX creator credits')
  if (platform === 'win32') {
    if(!readFileSync(join(resources,'native','portable-update.ps1')).equals(readFileSync(join(context.packager.projectDir,'native','portable-update.ps1'))))throw new Error('Missing or stale portable update helper')
    const locales = readdirSync(join(context.appOutDir, 'locales')).filter(name => name.endsWith('.pak')).sort()
    if (locales.join(',') !== 'en-US.pak,ja.pak,ko.pak') throw new Error(`Incorrect Electron locales: ${locales.join(', ')}`)
  }
  console.log(`Verified package: ${platform}-${architecture}, one matching SQLite addon, no build sources, runtime files and licenses present.`)
}
