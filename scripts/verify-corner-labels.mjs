/*
 * Proves every on-map label anchor lands INSIDE its block, on the angled /
 * skewed geometry that the old bounding-box placement failed on. Pure geometry,
 * no browser or DB. Run: node scripts/verify-corner-labels.mjs
 */
import { cornerLabelAnchors } from '../src/components/map/cornerLabels.ts'

// Ray-casting point-in-polygon. `verts` is the ring without the closing point.
function inside(pt, verts) {
  const [x, y] = pt
  let hit = false
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const [xi, yi] = verts[i]
    const [xj, yj] = verts[j]
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (crosses) hit = !hit
  }
  return hit
}

// Each case is an outer ring (closed). Coordinates roughly in LA lng/lat scale.
const CASES = {
  'axis-aligned rectangle (baseline)': [
    [-91.05, 29.95], [-91.046, 29.95], [-91.046, 29.953], [-91.05, 29.953], [-91.05, 29.95],
  ],
  'tilted parallelogram (typical cane row)': [
    [-91.05, 29.95], [-91.045, 29.9515], [-91.0435, 29.9545], [-91.0485, 29.953], [-91.05, 29.95],
  ],
  'strong skew, near-diamond': [
    [-91.05, 29.952], [-91.047, 29.9505], [-91.044, 29.952], [-91.047, 29.9535], [-91.05, 29.952],
  ],
  'thin sliver (narrow headland strip)': [
    [-91.05, 29.95], [-91.042, 29.9506], [-91.0419, 29.9508], [-91.0499, 29.9502], [-91.05, 29.95],
  ],
  'irregular 5-sided block': [
    [-91.05, 29.95], [-91.046, 29.9498], [-91.0435, 29.9518], [-91.0455, 29.9542], [-91.0495, 29.9535], [-91.05, 29.95],
  ],
  'clockwise-wound rectangle': [
    [-91.05, 29.95], [-91.05, 29.953], [-91.046, 29.953], [-91.046, 29.95], [-91.05, 29.95],
  ],
}

let failed = 0
for (const [name, ring] of Object.entries(CASES)) {
  const a = cornerLabelAnchors(ring)
  if (!a) {
    console.log(`✗ ${name}: returned null`)
    failed++
    continue
  }
  const verts = ring.slice(0, -1)
  const points = { center: a.center, id: a.id, variety: a.variety, acres: a.acres }
  const outside = Object.entries(points).filter(([, p]) => !inside(p, verts)).map(([k]) => k)

  // The three corner labels must also be distinct (no stacking on one vertex).
  const key = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`
  const corners = [a.id, a.variety, a.acres].map(key)
  const collided = new Set(corners).size !== corners.length

  if (outside.length || collided) {
    failed++
    console.log(`✗ ${name}`)
    if (outside.length) console.log(`    OUTSIDE block: ${outside.join(', ')}`)
    if (collided) console.log(`    corner labels collided (stacked on same vertex)`)
  } else {
    console.log(`✓ ${name} — all 4 anchors inside, corners distinct`)
  }
}

// --- Print projection: the plat sheet computes anchors in rotated-planar space
// (+Y up), then flips Y for SVG (svgY = maxY - ry). Prove the flip keeps the
// vertical corner assignment correct (name/variety on top, acres on the
// bottom) and that anchors stay inside the polygon after the flip. This is the
// one behavior the print path adds on top of cornerLabelAnchors. ---
console.log('\n--- print SVG projection (Y-flip) ---')
for (const [name, ring] of Object.entries(CASES)) {
  const a = cornerLabelAnchors(ring)
  if (!a) continue
  const verts = ring.slice(0, -1)
  const maxY = Math.max(...verts.map((v) => v[1]))
  const flip = (p) => [p[0], maxY - p[1]] // planar +Y-up -> SVG +Y-down
  const s = { id: flip(a.id), variety: flip(a.variety), acres: flip(a.acres), center: flip(a.center) }
  const flippedRing = verts.map(flip)
  const allInside = ['id', 'variety', 'acres', 'center'].every((k) => inside(s[k], flippedRing))
  // The corner layout only renders when a block is big enough in BOTH axes
  // (showCorners: minDim > 60px). A near-degenerate sliver falls back to a
  // centered label, so top/bottom ordering is only asserted for non-slivers.
  const xs = verts.map((v) => v[0])
  const ys = verts.map((v) => v[1])
  const aspect = (Math.max(...ys) - Math.min(...ys)) / (Math.max(...xs) - Math.min(...xs))
  const sliver = aspect < 0.15 || aspect > 1 / 0.15
  // In SVG space, top = smaller y. name (id) and variety must sit above acres.
  const topOrder = sliver || (s.id[1] < s.acres[1] && s.variety[1] < s.acres[1])
  if (allInside && topOrder) {
    console.log(`✓ ${name} — flip keeps anchors inside${sliver ? ' (sliver → centered fallback, order n/a)' : '; name/variety above acres'}`)
  } else {
    failed++
    console.log(`✗ ${name}${allInside ? '' : ' — anchor outside after flip'}${topOrder ? '' : ' — vertical order inverted'}`)
  }
}

console.log(failed ? `\n${failed} case(s) FAILED` : '\nAll cases passed.')
process.exit(failed ? 1 : 0)
