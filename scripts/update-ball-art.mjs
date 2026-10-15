import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

// Original, unmodified Scarlet/Violet bag sprites. See THIRD_PARTY_NOTICES.md.
const names = { poke: 'Poké', great: 'Great', ultra: 'Ultra', premier: 'Premier', luxury: 'Luxury', dusk: 'Dusk', master: 'Master' }
const directory = new URL('../src/renderer/src/assets/balls/', import.meta.url)
await mkdir(directory, { recursive: true })
const sources = {}
for (const [id, name] of Object.entries(names)) {
  const filename = `Bag_${name}_Ball_SV_Sprite.png`
  const hash = createHash('md5').update(filename).digest('hex')
  const url = `https://archives.bulbagarden.net/media/upload/${hash[0]}/${hash.slice(0, 2)}/${encodeURIComponent(filename)}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`)
  const data = Buffer.from(await response.arrayBuffer())
  if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || data.readUInt32BE(16) !== 160 || data.readUInt32BE(20) !== 160) throw new Error(`${id}: invalid PNG`)
  await writeFile(new URL(`${id}.png`, directory), data)
  sources[id] = { page: `https://archives.bulbagarden.net/wiki/File:${encodeURIComponent(filename)}`, image: url, sha256: createHash('sha256').update(data).digest('hex'), width: 160, height: 160 }
}
await writeFile(new URL('sources.json', directory), JSON.stringify({ game: 'Pokémon Scarlet and Violet', sources }, null, 2) + '\n')
console.log('Bundled seven original 160px ball sprites.')
