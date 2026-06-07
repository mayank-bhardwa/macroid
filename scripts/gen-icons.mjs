// Generates PNG app icons from a simple programmatic design.
// Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}
function lerp(a, b, t) { return Math.round(a + (b - a) * t) }

function makePng(size, opts = {}) {
  const { maskable = false } = opts
  const bg = [15, 17, 21]
  const c1 = [34, 211, 166]
  const c2 = [37, 99, 235]
  const pad = maskable ? size * 0.14 : 0
  const cx = size / 2, cy = size / 2
  const ringR = (size - pad * 2) * 0.30
  const ringW = size * 0.066

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter byte
    for (let x = 0; x < size; x++) {
      const o = y * (stride + 1) + 1 + x * 4
      let r = bg[0], g = bg[1], b = bg[2]
      // rounded corner background (only when not maskable; maskable fills full bleed)
      const radius = size * 0.22
      let inside = true
      if (!maskable) {
        const dx = Math.max(radius - x, x - (size - radius), 0)
        const dy = Math.max(radius - y, y - (size - radius), 0)
        if (dx * dx + dy * dy > radius * radius) inside = false
      }
      if (inside) {
        const t = (x + y) / (2 * size)
        const gr = lerp(c1[0], c2[0], t)
        const gg = lerp(c1[1], c2[1], t)
        const gb = lerp(c1[2], c2[2], t)
        const dist = Math.hypot(x - cx, y - cy)
        if (Math.abs(dist - ringR) < ringW / 2) {
          r = gr; g = gg; b = gb
        }
        // small dot
        const dotR = size * 0.052
        if (Math.hypot(x - (cx + ringR * 0.55), y - (cy + ringR * 0.4)) < dotR) {
          r = c1[0]; g = c1[1]; b = c1[2]
        }
      } else {
        r = 0; g = 0; b = 0
      }
      const a = inside ? 255 : 0
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const idat = deflateSync(raw)
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

writeFileSync(join(outDir, 'icon-192.png'), makePng(192))
writeFileSync(join(outDir, 'icon-512.png'), makePng(512))
writeFileSync(join(outDir, 'maskable-512.png'), makePng(512, { maskable: true }))
writeFileSync(join(outDir, 'apple-touch-icon.png'), makePng(180))
console.log('Icons generated in', outDir)
