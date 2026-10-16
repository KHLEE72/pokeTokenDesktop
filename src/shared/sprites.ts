import catalog from './sprite-catalog.json'
import { POKEMON_BY_ID } from './catalog'

export type SpriteFormat = 'gif' | 'png'
const animated = { normal: new Set(catalog.animated.normal), shiny: new Set(catalog.animated.shiny) }
const png = { normal: new Set(catalog.png.normal), shiny: new Set(catalog.png.shiny) }
export function spriteSources(id: number, shiny = false): { url: string; format: SpriteFormat }[] {
  if (!Number.isInteger(id) || !POKEMON_BY_ID.has(id)) return []
  const variant = shiny ? 'shiny' : 'normal', prefix = shiny ? 'shiny/' : ''
  const base = `https://raw.githubusercontent.com/PokeAPI/sprites/${catalog.source.revision}/sprites/pokemon/`
  return [
    ...(animated[variant].has(id) ? [{ url: `${base}versions/generation-v/black-white/animated/${prefix}${id}.gif`, format: 'gif' as const }] : []),
    ...(png[variant].has(id) ? [{ url: `${base}${prefix}${id}.png`, format: 'png' as const }] : [])
  ]
}
export function spriteFormat(bytes: Buffer): SpriteFormat | null {
  if (bytes.length < 20 || bytes.length >= 2 * 1024 * 1024) return null
  if (bytes.subarray(0, 6).toString() === 'GIF87a' || bytes.subarray(0, 6).toString() === 'GIF89a') return 'gif'
  return bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ? 'png' : null
}
