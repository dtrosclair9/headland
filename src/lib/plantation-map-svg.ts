import type { FieldRow } from '@/lib/fields'
import { colorForRatoon, cutAbbrev } from '@/lib/ratoon-colors'

export interface LabelLine {
  text: string
  bold: boolean
}

export interface SvgBlock {
  id: string
  points: string
  color: string
  /** block center — anchor for both the single-field acreage and the stack */
  labelX: number
  labelY: number
  /** base font (single-field print's centered acreage) */
  fontSize: number
  /** single-field print label */
  acreageLabel: string
  /**
   * Plat-sheet label: the same info the interactive map shows (name, cut,
   * variety, acres) as a centered vertical stack, sized to the block and
   * trimmed to the lines that fit. Centered stacking is collision-proof — real
   * cane blocks are narrow angled parallelograms where corner labels overlap.
   */
  labelFont: number
  lines: LabelLine[]
}

export interface PlantationSvg {
  width: number
  height: number
  blocks: SvgBlock[]
  /** ratoon stage keys present among these blocks, for the legend */
  stagesPresent: string[]
  hasUnset: boolean
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

// The room a horizontally-centered label actually has inside a block. Rays cast
// from the centroid to the polygon edges (horizontally for width, vertically for
// height). This is the TRUE usable box — a block's axis-aligned bounding box
// badly overestimates width once the farm is rotated and blocks become tilted
// parallelograms (bbox width includes the shear, not the real cross-section).
function centeredBox(ring: [number, number][], cx: number, cy: number): { w: number; h: number } {
  // Intersections of the polygon edges with the line `along === value`.
  const cross = (alongX: boolean, value: number): number[] => {
    const out: number[] = []
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i]
      const b = ring[i + 1]
      const ca = alongX ? a[0] : a[1]
      const cb = alongX ? b[0] : b[1]
      if (ca === cb) continue
      const t = (value - ca) / (cb - ca)
      if (t < 0 || t > 1) continue
      out.push(alongX ? a[1] + t * (b[1] - a[1]) : a[0] + t * (b[0] - a[0]))
    }
    return out
  }
  // Horizontal room: where the polygon crosses y = cy.
  const xs = cross(false, cy)
  const ys = cross(true, cx)
  const w = xs.length >= 2 ? 2 * Math.min(cx - Math.min(...xs), Math.max(...xs) - cx) : 0
  const h = ys.length >= 2 ? 2 * Math.min(cy - Math.min(...ys), Math.max(...ys) - cy) : 0
  return { w: Math.max(0, w), h: Math.max(0, h) }
}

// Compact variety code for the plat sheet: 'v' + the last 3 digits of the
// variety (e.g. 'HoCP 96-540' → 'v540', 'L 01-299' → 'v299', '838' → 'v838'),
// so a variety never eats horizontal space in a narrow block. Empty when the
// variety carries no digits (e.g. a stray 'Fallow' in the variety column).
export function varietyCode(variety: string | null | undefined): string {
  const digits = String(variety ?? '').replace(/\D/g, '')
  return digits ? 'v' + digits.slice(-3) : ''
}

// Plan a block's centered label stack. Given the block's width/height in SVG px
// and its parts, choose a font size and the lines that actually fit — dropping
// the lowest-priority line (variety → cut → acres) until the stack fits both
// vertically and horizontally. Display order is always name / cut / variety /
// acres so identity reads on top and acreage on the bottom.
function planLabel(
  w: number,
  h: number,
  parts: { name: string; cut: string; variety: string; acres: string },
  floor: number,
  cutBeforeVariety: boolean,
): { font: number; lines: LabelLine[] } {
  const named = parts.name.trim() && parts.name.trim().toLowerCase() !== 'untitled'
  const cand: { text: string; bold: boolean; prio: number; order: number }[] = []
  if (named) cand.push({ text: parts.name, bold: true, prio: 1, order: 0 })
  cand.push({ text: parts.acres, bold: false, prio: 2, order: 3 })
  // On the spray sheet cut isn't shown by color, so keep it longer than variety;
  // on the crop sheet the fill already encodes cut, so drop it first.
  if (parts.cut) cand.push({ text: parts.cut, bold: true, prio: cutBeforeVariety ? 3 : 4, order: 1 })
  if (parts.variety) cand.push({ text: parts.variety, bold: false, prio: cutBeforeVariety ? 4 : 3, order: 2 })

  const CAP = 15
  const CHAR_W = 0.6 // approx glyph advance as a fraction of font size
  const LINE_H = 1.16
  const base = clamp(Math.min(w, h) * 0.28, floor, CAP)

  // Keep candidates by priority; drop the least important until it fits at a
  // readable size (or only one line is left).
  const keep = [...cand].sort((a, b) => a.prio - b.prio)
  let font = base
  while (keep.length) {
    const fontV = (h * 0.9) / (keep.length * LINE_H)
    const widest = Math.max(...keep.map((c) => c.text.length * CHAR_W))
    const fontH = (w * 0.92) / widest
    font = Math.min(base, fontV, fontH)
    if (font >= floor || keep.length === 1) break
    keep.pop()
  }
  font = clamp(font, floor, CAP)
  const lines = keep.sort((a, b) => a.order - b.order).map((c) => ({ text: c.text, bold: c.bold }))
  return { font, lines }
}

// Aspect ratio of the printable map area on a letter-landscape sheet (≈10in
// wide × ≈6.3in tall after the title/legend). The farm is auto-rotated to best
// fill this, so a long diagonal farm prints across the page (like FarmWorks).
const PRINT_AREA_ASPECT = 1.59

// Project blocks (lng/lat) onto a flat white canvas — local equirectangular
// with a cos(lat) longitude correction, accurate for a single farm/plantation.
// The whole farm is rotated to the orientation that maximizes printed area on a
// landscape page; block labels stay upright. No basemap; plat-map schematic.
//
// Two render styles share all the geometry:
//  - 'crop'  → each block filled with its ratoon color; small blocks drop their
//              name to avoid clutter.
//  - 'spray' → every block white (the pilot colors it in); EVERY block keeps its
//              name (font shrinks to a lower floor to fit slivers).
type SvgStyle = 'crop' | 'spray'

// Colored plat map (blocks by year cane). Default print/screen schematic.
export function buildPlantationSvg(
  blocks: FieldRow[],
  opts: { canvasWidth?: number; pad?: number; unitsArpents?: boolean } = {},
): PlantationSvg | null {
  return buildSvg(blocks, 'crop', opts)
}

// Black-and-white outline map for sprayer pilots: white fill, every block named.
export function buildSpraySvg(
  blocks: FieldRow[],
  opts: { canvasWidth?: number; pad?: number; unitsArpents?: boolean } = {},
): PlantationSvg | null {
  return buildSvg(blocks, 'spray', opts)
}

function buildSvg(
  blocks: FieldRow[],
  style: SvgStyle,
  opts: { canvasWidth?: number; pad?: number; unitsArpents?: boolean } = {},
): PlantationSvg | null {
  const canvasWidth = opts.canvasWidth ?? 1100
  const pad = opts.pad ?? 28

  const pts: [number, number][] = []
  for (const b of blocks) {
    for (const ring of b.geometry?.coordinates ?? []) {
      for (const c of ring) pts.push([c[0], c[1]])
    }
  }
  if (pts.length === 0) return null

  const lats = pts.map((p) => p[1])
  const meanLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const k = Math.cos((meanLat * Math.PI) / 180) || 1
  // Local equirectangular planar coords (consistent distances within one farm).
  const proj = (lng: number, lat: number): [number, number] => [lng * k, lat]

  // Center to rotate about.
  const planar = pts.map(([lng, lat]) => proj(lng, lat))
  const cx = (Math.min(...planar.map((p) => p[0])) + Math.max(...planar.map((p) => p[0]))) / 2
  const cy = (Math.min(...planar.map((p) => p[1])) + Math.max(...planar.map((p) => p[1]))) / 2

  // Find the rotation that lets the farm be largest on the landscape page —
  // maximize the fit scale = min(pageW/w, pageH/h) of the rotated bounding box.
  let bestAngle = 0
  let bestScore = -Infinity
  for (let deg = 0; deg < 180; deg += 1) {
    const t = (deg * Math.PI) / 180
    const cos = Math.cos(t)
    const sin = Math.sin(t)
    let mnx = Infinity,
      mxx = -Infinity,
      mny = Infinity,
      mxy = -Infinity
    for (const [px, py] of planar) {
      const dx = px - cx
      const dy = py - cy
      const rx = dx * cos - dy * sin
      const ry = dx * sin + dy * cos
      if (rx < mnx) mnx = rx
      if (rx > mxx) mxx = rx
      if (ry < mny) mny = ry
      if (ry > mxy) mxy = ry
    }
    const w = mxx - mnx || 1e-9
    const h = mxy - mny || 1e-9
    const score = Math.min(PRINT_AREA_ASPECT / w, 1 / h)
    if (score > bestScore) {
      bestScore = score
      bestAngle = t
    }
  }
  const ca = Math.cos(bestAngle)
  const sa = Math.sin(bestAngle)
  // Rotated planar coords (relative to center).
  const rot = (lng: number, lat: number): [number, number] => {
    const [px, py] = proj(lng, lat)
    const dx = px - cx
    const dy = py - cy
    return [dx * ca - dy * sa, dx * sa + dy * ca]
  }

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  for (const [lng, lat] of pts) {
    const [rx, ry] = rot(lng, lat)
    if (rx < minX) minX = rx
    if (rx > maxX) maxX = rx
    if (ry < minY) minY = ry
    if (ry > maxY) maxY = ry
  }

  const spanX = maxX - minX || 1e-6
  const spanY = maxY - minY || 1e-6
  const scale = (canvasWidth - 2 * pad) / spanX
  const height = spanY * scale + 2 * pad
  const toXY = (lng: number, lat: number): [number, number] => {
    const [rx, ry] = rot(lng, lat)
    return [pad + (rx - minX) * scale, pad + (maxY - ry) * scale] // flip Y for SVG
  }

  const stages = new Set<string>()
  let hasUnset = false

  const svgBlocks: SvgBlock[] = blocks.map((b) => {
    const outer = b.geometry?.coordinates?.[0] ?? []
    let bMinX = Infinity,
      bMaxX = -Infinity,
      bMinY = Infinity,
      bMaxY = -Infinity
    const svgRing: [number, number][] = []
    const coords = outer.map(([lng, lat]) => {
      const [x, y] = toXY(lng, lat)
      svgRing.push([x, y])
      if (x < bMinX) bMinX = x
      if (x > bMaxX) bMaxX = x
      if (y < bMinY) bMinY = y
      if (y > bMaxY) bMaxY = y
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    const minDim = Math.min(bMaxX - bMinX, bMaxY - bMinY)
    // Spray sheets must name every block, so they allow a smaller font floor to
    // fit slivers; the crop sheet keeps a larger floor.
    const fontSize = clamp(minDim * 0.16, style === 'spray' ? 4.5 : 6, 15)

    if (b.current_ratoon) stages.add(b.current_ratoon)
    else hasUnset = true

    const acreageLabel = opts.unitsArpents
      ? Number(b.arpents_cached || 0).toFixed(2)
      : Number(b.acreage_cached || 0).toFixed(2)

    // Centered stack of the same info the map shows (name / cut / variety /
    // acres), trimmed to what fits the block. Size to the block's true centered
    // box (not its bbox — tilted blocks have a much wider bbox than real room).
    const [lx, ly] = toXY(b.centroid_lng, b.centroid_lat)
    const box = centeredBox(svgRing, lx, ly)
    const { font: labelFont, lines } = planLabel(
      box.w,
      box.h,
      {
        name: b.name ?? '',
        cut: cutAbbrev(b.current_ratoon),
        variety: varietyCode(b.variety),
        acres: acreageLabel,
      },
      style === 'spray' ? 4.5 : 5.5,
      style === 'spray',
    )

    return {
      id: b.id,
      points: coords.join(' '),
      color: style === 'spray' ? '#FFFFFF' : colorForRatoon(b.current_ratoon),
      labelX: lx,
      labelY: ly,
      fontSize,
      acreageLabel,
      labelFont,
      lines,
    }
  })

  return {
    width: canvasWidth,
    height,
    blocks: svgBlocks,
    stagesPresent: Array.from(stages),
    hasUnset,
  }
}
