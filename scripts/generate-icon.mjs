import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

/*
 * Loom's app icon, drawn without dependencies.
 *
 * The mark is the one in the header (`src/renderer/src/LoomMark.tsx`): a warp
 * thread running top to bottom, and the weft looped around it - once to the
 * right, once to the left. The geometry below is that component's, scaled off
 * its 100-unit viewBox, so the mark beside the wordmark and the mark in the
 * taskbar are the same drawing. Change one, change the other.
 *
 * Why this shape. The family draws the thing the app is named after - Helm a
 * ship's wheel, Nib a pen nib. A whole loom is a frame, and a frame at 16px is
 * a grey rectangle, so this draws the *interlacement* instead: the path a weft
 * thread takes through the warp. Which is also, exactly, a branch leaving the
 * trunk and merging back - the picture Loom already draws in its commit graph.
 * Two readings, both true.
 *
 * Rejected on the way here, all of them tested at 16px first: a plain weave
 * (three warps, two wefts) turned to stripes; two strands crossing read as a
 * bare X, which on a git client says "close"; a shuttle read as an eye; a
 * single branch-and-merge read as the letter thorn. Pulling the two loops apart
 * so the warp shows between them is what stops this one reading as a dollar
 * sign.
 *
 * Two drawings, per the family rule Nib's generator sets out:
 *
 *  - The full mark at 32px and up.
 *  - Below 32, a heavier thread and wider loops, because the true weight thins
 *    under a pixel and the loops close up against the warp.
 *
 * The PNG and ICO writers are Jot's and Nib's, kept identical on purpose -
 * three apps, one icon pipeline.
 *
 * Run with `node scripts/generate-icon.mjs`. The output is committed, because
 * packaging must not depend on having run a script first.
 */

const here = dirname(fileURLToPath(import.meta.url))
// electron-builder's buildResources for this project, so it picks the .ico up.
const outDir = join(here, '..', 'build')
mkdirSync(outDir, { recursive: true })

// ---------- PNG ----------

function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i]
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

function renderPng(size, shade) {
  const rows = []
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4)
    for (let x = 0; x < size; x += 1) {
      row.set(shade(x + 0.5, y + 0.5, size), 1 + x * 4)
    }
    rows.push(row)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- ICO ----------

/**
 * A Vista-era .ico: a directory of entries, each holding a whole PNG.
 *
 * Written by hand so the small sizes can be a different drawing. Handing
 * electron-builder a single large PNG would have it downscale that one drawing
 * to 16px, which is exactly what the second drawing exists to avoid.
 */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  const directory = []
  let offset = 6 + images.length * 16
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16)
    entry[0] = size >= 256 ? 0 : size // 0 means 256
    entry[1] = size >= 256 ? 0 : size
    entry[2] = 0 // palette
    entry[3] = 0 // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    directory.push(entry)
    offset += png.length
  }

  return Buffer.concat([header, ...directory, ...images.map((image) => image.png)])
}

// ---------- distance fields ----------

const mix = (a, b, t) => a + (b - a) * t

function distSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax
  const aby = by - ay
  const lengthSquared = abx * abx + aby * aby
  if (lengthSquared === 0) {
    return Math.hypot(px - ax, py - ay)
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSquared))
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t))
}

/** Distance to an open polyline. */
function distPolyline(px, py, points) {
  let best = Infinity
  for (let i = 0; i < points.length - 1; i += 1) {
    best = Math.min(best, distSegment(px, py, ...points[i], ...points[i + 1]))
  }
  return best
}

/**
 * A cubic bezier flattened to a polyline, so the loops get the same round-capped
 * distance treatment as the straight warp. 40 steps is well past the point where
 * more makes a visible difference even at 256px.
 */
function flattenBezier(p0, p1, p2, p3, steps = 40) {
  const points = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const u = 1 - t
    points.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
    ])
  }
  return points
}

/** Anti-aliasing: coverage falls off across about a pixel of distance. */
function coverage(distance, halfWeight, feather = 1.1) {
  return Math.max(0, Math.min(1, (halfWeight - distance) / feather + 0.5))
}

/**
 * Madder, run across the diagonal the way the siblings are.
 *
 * Its own point on the family's warm spectrum: redder and more saturated than
 * Helm's terracotta, clear of Jot's pink-leaning coral and Nib's gold. Note this
 * is deliberately not Loom's UI accent (`--accent`, a warm tan) - Jot does the
 * same, coral mark over a blue UI. The mark's colour is a family decision; the
 * accent is a UI one.
 */
function madder(x, y, size) {
  const t = Math.max(0, Math.min(1, (x / size) * 0.5 + (y / size) * 0.5))
  return [
    Math.round(mix(233, 186, t)),
    Math.round(mix(102, 56, t)),
    Math.round(mix(76, 66, t))
  ]
}

// ---------- the two drawings ----------

/*
 * Both drawings as fractions of the canvas, matching LoomMark's 100-unit
 * viewBox. The changeover is at 32, the same threshold Jot uses.
 */
const FULL = {
  weight: 0.11,
  // 0.085, not 0.05: the warp's round cap reaches half a stroke past its end, so
  // ending it at 0.05 clipped the cap flat against the top of the canvas.
  warp: [0.5, 0.085, 0.5, 0.915],
  loops: [
    // right loop: out from the warp, round, and back
    [[0.5, 0.17], [0.76, 0.17], [0.83, 0.24], [0.83, 0.315]],
    [[0.83, 0.315], [0.83, 0.39], [0.76, 0.45], [0.5, 0.45]],
    // left loop, lower down - the offset is what keeps it off the alphabet
    [[0.5, 0.55], [0.24, 0.55], [0.17, 0.61], [0.17, 0.685]],
    [[0.17, 0.685], [0.17, 0.76], [0.24, 0.83], [0.5, 0.83]]
  ]
}

const SMALL = {
  weight: 0.145,
  warp: [0.5, 0.09, 0.5, 0.91],
  loops: [
    [[0.5, 0.2], [0.78, 0.2], [0.86, 0.27], [0.86, 0.335]],
    [[0.86, 0.335], [0.86, 0.4], [0.78, 0.45], [0.5, 0.45]],
    [[0.5, 0.55], [0.22, 0.55], [0.14, 0.6], [0.14, 0.665]],
    [[0.14, 0.665], [0.14, 0.73], [0.22, 0.8], [0.5, 0.8]]
  ]
}

/** The warp, and the weft looped around it. */
function shadeMark(x, y, size) {
  const mark = size < 32 ? SMALL : FULL
  const scale = ([px, py]) => [size * px, size * py]

  const distances = [
    distSegment(
      x,
      y,
      size * mark.warp[0],
      size * mark.warp[1],
      size * mark.warp[2],
      size * mark.warp[3]
    ),
    ...mark.loops.map((loop) => distPolyline(x, y, flattenBezier(...loop).map(scale)))
  ]

  const alpha = coverage(Math.min(...distances), (size * mark.weight) / 2)
  if (alpha === 0) {
    return [0, 0, 0, 0]
  }
  const [red, green, blue] = madder(x, y, size)
  return [red, green, blue, Math.round(255 * alpha)]
}

// ---------- output ----------

// The PNG electron-builder falls back to (and what non-Windows targets use).
writeFileSync(join(outDir, 'icon.png'), renderPng(512, shadeMark))

// What ships on Windows. 20 and 24 are in there for 125% and 150% display
// scaling, the two scales where a missing frame means a resample.
writeFileSync(
  join(outDir, 'icon.ico'),
  buildIco(
    [256, 128, 64, 48, 32, 24, 20, 16].map((size) => ({ size, png: renderPng(size, shadeMark) }))
  )
)

console.log('Wrote build/icon.png and build/icon.ico')
