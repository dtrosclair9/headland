import type { FieldRow } from '@/lib/fields'
import type { AnnotationRow } from '@/lib/annotations'
import { cutAbbrev } from '@/lib/ratoon-colors'
import { stageColorFor } from '@/lib/resolve-colors'

// A fully-positioned piece of text inside a block. The builder decides
// placement, size, and anchoring; PlatSheet just draws the list.
export interface PlacedLabel {
  x: number
  y: number
  font: number
  text: string
  bold: boolean
  anchor: 'start' | 'middle' | 'end'
}

export interface SvgBlock {
  id: string
  points: string
  color: string
  /** block center — anchor for the single-field print's acreage */
  labelX: number
  labelY: number
  /** base font (single-field print's centered acreage) */
  fontSize: number
  /** single-field print label */
  acreageLabel: string
  /**
   * Plat-sheet labels, each pinned to its own spot the FarmWorks way: name in
   * the top-left corner, variety (v-code) top-right, acres bottom-right, cut in
   * the center. Positions come from ray-casting the block's interior at each
   * label's height, so text is guaranteed to sit inside the block even on
   * tilted parallelograms; lines that can't fit are shrunk or dropped.
   */
  labels: PlacedLabel[]
}

// A projected hand-drawn annotation: a polyline (road/ditch) or a text label.
export interface SvgAnnotation {
  kind: 'line' | 'text'
  /** polyline points (kind='line') */
  points?: string
  /** label anchor (kind='text') */
  x?: number
  y?: number
  text?: string
  color: string
}

export interface PlantationSvg {
  width: number
  height: number
  blocks: SvgBlock[]
  annotations: SvgAnnotation[]
  /** ratoon stage keys present among these blocks, for the legend */
  stagesPresent: string[]
  hasUnset: boolean
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

// Where the polygon's edges cross the line `along === value` (alongX=true means
// the vertical line x=value, returning y's; alongX=false the horizontal line
// y=value, returning x's).
function crossings(ring: [number, number][], alongX: boolean, value: number): number[] {
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

// The interior [left, right] of the block at height y — the exact walls a label
// on that line must stay between. This is what makes corner placement safe on
// tilted parallelograms: the bbox corner lies OUTSIDE the block, but the ray
// tells us where the block actually is at that height.
function spanAtY(ring: [number, number][], y: number): [number, number] | null {
  const xs = crossings(ring, false, y)
  if (xs.length < 2) return null
  return [Math.min(...xs), Math.max(...xs)]
}

// The room a centered label has inside a block (rays from the centroid).
// A tilted block's axis-aligned bbox badly overestimates its real width.
function centeredBox(ring: [number, number][], cx: number, cy: number): { w: number; h: number } {
  const xs = crossings(ring, false, cy)
  const ys = crossings(ring, true, cx)
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

// Approximate glyph advance as a fraction of font size (Inter/system sans).
const CHAR_W = 0.62
// Hard readability floor — below this a label is dropped rather than shrunk.
const MIN_FONT = 3.4

// Plan a block's labels in the FarmWorks arrangement: name top-left, variety
// (v-code) top-right, acres bottom-right, cut centered. Each corner label is
// positioned by ray-casting the block interior at that label's height, so the
// anchor is the block's REAL wall at that line (not the bbox corner, which sits
// outside a tilted block). Labels shrink to fit their available run and drop
// (variety first, then cut, then name) when a block is too small; acres always
// survives, falling back to a single centered line on slivers.
function planCornerLabels(
  ring: [number, number][],
  cx: number,
  cy: number,
  parts: { name: string; cut: string; variety: string; acres: string },
  floor: number,
): PlacedLabel[] {
  const named = !!parts.name.trim() && parts.name.trim().toLowerCase() !== 'untitled'
  let minY = Infinity
  let maxY = -Infinity
  for (const [, y] of ring) {
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const H = maxY - minY
  const box = centeredBox(ring, cx, cy)
  const base = clamp(Math.min(box.w, box.h) * 0.26, floor, 13)
  const inset = Math.max(1.4, base * 0.4)

  // Shrink a label to fit `room`; null when it can't reach MIN_FONT.
  const fit = (text: string, room: number, font: number): number | null => {
    if (!text || room <= 0) return null
    const needed = text.length * CHAR_W
    const f = Math.min(font, room / needed)
    return f >= MIN_FONT ? f : null
  }

  const labels: PlacedLabel[] = []

  // Sliver fallback: not enough height for two label rows — one centered line.
  if (H < base * 2.6) {
    const f = fit(parts.acres, box.w - 2, Math.min(base, H * 0.5))
    if (f) labels.push({ x: cx, y: cy, font: f, text: parts.acres, bold: false, anchor: 'middle' })
    return labels
  }

  const yTop = minY + inset + base * 0.5
  const yBot = maxY - inset - base * 0.5
  const top = spanAtY(ring, yTop)
  const bot = spanAtY(ring, yBot)

  // Top row: name pinned to the left wall, variety to the right wall.
  if (top) {
    const [tL, tR] = [top[0] + inset, top[1] - inset]
    const room = tR - tL
    const gap = base * 0.9
    const nameW = named ? parts.name.length * CHAR_W * base : 0
    let nameF: number | null = null
    let varF: number | null = null
    if (named && parts.variety && nameW + gap + parts.variety.length * CHAR_W * base <= room) {
      nameF = base
      varF = base
    } else {
      // Not enough for both at full size — name wins, variety drops.
      if (named) nameF = fit(parts.name, room, base)
      else if (parts.variety) varF = fit(parts.variety, room, base)
    }
    if (nameF) labels.push({ x: tL, y: yTop, font: nameF, text: parts.name, bold: true, anchor: 'start' })
    if (varF) labels.push({ x: tR, y: yTop, font: varF, text: parts.variety, bold: false, anchor: 'end' })
  }

  // Bottom row: acres pinned to the right wall.
  if (bot) {
    const [bL, bR] = [bot[0] + inset, bot[1] - inset]
    const f = fit(parts.acres, bR - bL, base)
    if (f) labels.push({ x: bR, y: yBot, font: f, text: parts.acres, bold: false, anchor: 'end' })
  }

  // Center: the cut, when there's a clear band between the two rows.
  if (parts.cut && H >= base * 4) {
    const f = fit(parts.cut, box.w - 2, base * 1.15)
    if (f) labels.push({ x: cx, y: cy, font: f, text: parts.cut, bold: true, anchor: 'middle' })
  }

  return labels
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
interface BuildOpts {
  canvasWidth?: number
  pad?: number
  unitsArpents?: boolean
  /** the farm's custom stage colors (key -> hex); defaults used when absent */
  stageColors?: Record<string, string>
  /** hand-drawn reference lines + text labels to print over the blocks */
  annotations?: AnnotationRow[]
}

export function buildPlantationSvg(blocks: FieldRow[], opts: BuildOpts = {}): PlantationSvg | null {
  return buildSvg(blocks, 'crop', opts)
}

// Black-and-white outline map for sprayer pilots: white fill, every block named.
export function buildSpraySvg(blocks: FieldRow[], opts: BuildOpts = {}): PlantationSvg | null {
  return buildSvg(blocks, 'spray', opts)
}

function buildSvg(blocks: FieldRow[], style: SvgStyle, opts: BuildOpts = {}): PlantationSvg | null {
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

    // Corner labels, each in its own spot (name TL, variety TR, acres BR, cut
    // center), positioned against the block's real interior walls.
    const [lx, ly] = toXY(b.centroid_lng, b.centroid_lat)
    // The spray sheet (fly plan) carries ONLY id + acreage + hand-drawn
    // annotations — no cut or variety. Crop map keeps the full label set.
    const labels = planCornerLabels(
      svgRing,
      lx,
      ly,
      {
        name: b.name ?? '',
        cut: style === 'spray' ? '' : cutAbbrev(b.current_ratoon),
        variety: style === 'spray' ? '' : varietyCode(b.variety),
        acres: acreageLabel,
      },
      style === 'spray' ? 4.2 : 5,
    )

    return {
      id: b.id,
      points: coords.join(' '),
      color:
        style === 'spray' ? '#FFFFFF' : stageColorFor(b.current_ratoon, opts.stageColors ?? {}),
      labelX: lx,
      labelY: ly,
      fontSize,
      acreageLabel,
      labels,
    }
  })

  // Project the hand-drawn annotations with the same rotation/flip as the
  // blocks. The framing is still block-driven — anything off-page just clips.
  const svgAnnotations: SvgAnnotation[] = (opts.annotations ?? []).flatMap(
    (a): SvgAnnotation[] => {
    if (a.kind === 'line' && a.geometry.type === 'LineString') {
      const pts = a.geometry.coordinates.map(([lng, lat]) => {
        const [x, y] = toXY(lng, lat)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      return [{ kind: 'line' as const, points: pts.join(' '), color: a.color }]
    }
    if (a.kind === 'text' && a.geometry.type === 'Point') {
      const [x, y] = toXY(a.geometry.coordinates[0], a.geometry.coordinates[1])
      return [{ kind: 'text' as const, x, y, text: a.text ?? '', color: a.color }]
    }
    return []
    },
  )

  return {
    width: canvasWidth,
    height,
    blocks: svgBlocks,
    annotations: svgAnnotations,
    stagesPresent: Array.from(stages),
    hasUnset,
  }
}
