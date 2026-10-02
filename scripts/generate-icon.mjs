import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) { crc ^= byte; for (let n = 0; n < 8; n++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1 }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4)
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, crc])
}
function png(size) {
  const scan = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = (x + .5) / size, py = (y + .5) / size, radius = .28 + .09 * py
    const inside = ((px - .5) / radius) ** 2 + ((py - .5) / .44) ** 2 < 1
    const edge = ((px - .5) / (radius - .03)) ** 2 + ((py - .5) / .41) ** 2 >= 1
    const spot = [[.41,.29,.07],[.64,.55,.09],[.34,.69,.085]].some(([cx,cy,r]) => Math.hypot(px-cx,py-cy)<r)
    const rgba = !inside ? [0,0,0,0] : edge ? [50,80,54,255] : spot ? [114,168,111,255] : [250,246,223,255]
    const offset = y * (size * 4 + 1) + 1 + x * 4
    scan.set(rgba, offset)
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size,4); header[8]=8; header[9]=6
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))])
}
mkdirSync('build', { recursive: true })
writeFileSync('build/tray.png', png(24)); const icon = png(256); writeFileSync('build/icon.png', icon)
writeFileSync('build/icon-mac.png', png(1024))
const ico = Buffer.alloc(22); ico.writeUInt16LE(1,2); ico.writeUInt16LE(1,4); ico.writeUInt16LE(1,10); ico.writeUInt16LE(32,12); ico.writeUInt32LE(icon.length,14); ico.writeUInt32LE(22,18)
writeFileSync('build/icon.ico', Buffer.concat([ico,icon]))
