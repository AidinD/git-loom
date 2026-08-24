import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import {
  renderPng,
  renderIco,
  coverage,
  diagonalRamp,
  distPolyline,
  distSegment,
  flattenBezier,
  SMALL_BELOW
} from 'keel/icon'

/*
 * Loom's app icon.
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
 * Two drawings, per the family rule keel encodes: the full mark at 32px and up,
 * and below that a heavier thread with wider loops, because the true weight
 * thins under a pixel and the loops close up against the warp.
 *
 * The PNG writer, the ICO writer and the distance-field helpers come from
 * `keel/icon`, shared with the rest of the suite. What is left here is Loom's
 * geometry and Loom's colour, which is all this file ever should have been.
 *
 * Run with `node scripts/generate-icon.mjs`. The output is committed, because
 * packaging must not depend on having run a script first.
 */

const here = dirname(fileURLToPath(import.meta.url))
// electron-builder's buildResources for this project, so it picks the .ico up.
const outDir = join(here, '..', 'build')
mkdirSync(outDir, { recursive: true })

/**
 * Madder, run across the diagonal the way the siblings are.
 *
 * Its own point on the family's warm spectrum: redder and more saturated than
 * Helm's terracotta, clear of Jot's pink-leaning coral and Nib's gold. Note this
 * is deliberately not Loom's UI accent (`--accent`, a warm tan) - Jot does the
 * same, coral mark over a blue UI. The mark's colour is a family decision; the
 * accent is a UI one.
 */
const madder = diagonalRamp([233, 102, 76], [186, 56, 66])

/*
 * Both drawings as fractions of the canvas, matching LoomMark's 100-unit
 * viewBox. The changeover is keel's SMALL_BELOW, the same threshold Jot uses.
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
  const mark = size < SMALL_BELOW ? SMALL : FULL
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

// The PNG electron-builder falls back to (and what non-Windows targets use).
writeFileSync(join(outDir, 'icon.png'), renderPng(512, shadeMark))

// What ships on Windows. keel's DEFAULT_LADDER already carries 20 and 24 for
// 125% and 150% display scaling, the two scales where a missing frame means a
// resample.
writeFileSync(join(outDir, 'icon.ico'), renderIco(shadeMark))

console.log('Wrote build/icon.png and build/icon.ico')
