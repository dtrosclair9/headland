import type { FieldRow } from '@/lib/fields'
import type { AnnotationRow } from '@/lib/annotations'
import { cutAbbrev, UNSET_RATOON_COLOR } from '@/lib/ratoon-colors'
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
  /**
   * Dark label text (white/uncolored fill) vs white label text with a dark
   * halo (colored fill). Per-block because a highlight sheet mixes both.
   */
  labelDark: boolean
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
  /** text size in svg units (kind='text') */
  size?: number
  /** text rotation in degrees (kind='text') */
  rotation?: number
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

// Compact variety code for the plat sheet: just the last 3 digits (e.g.
// 'HoCP 96-540' → '540', 'L 01-299' → '299') — farmers know their varieties
// by those digits, and dropping the 'v' buys room on narrow blocks. Empty
// when the variety carries no digits (e.g. a stray 'Fallow' in the column).
export function varietyCode(variety: string | null | undefined): string {
  const digits = String(variety ?? '').replace(/\D/g, '')
  return digits ? digits.slice(-3) : ''
}

// Approximate glyph advance as a fraction of font size (Inter/system sans).
const CHAR_W = 0.62
// Hard readability floor — below this a label is dropped rather than shrunk.
const MIN_FONT = 3.4

// Uniform print label size. NON-NEGOTIABLE RULE: every block prints all four
// facts — id, acres, variety, cycle — on every sheet. Text is NOT scaled to
// the block; one small fixed size everywhere means nothing ever gets dropped
// for lack of room. A tiny block may have snug text, but the data is there.
// 10.5 canvas units ≈ 6.5pt on a letter landscape sheet — old-farmer-readable.
const PRINT_FONT = 10.5

// Place a block's labels in the FarmWorks arrangement: name top-left, variety
// (v-code) top-right, acres bottom-right, cut centered. Corner anchors come
// from ray-casting the block interior at the label's height, so text hugs the
// block's REAL walls even on tilted parallelograms. No fitting, no dropping.
function planCornerLabels(
  ring: [number, number][],
  cx: number,
  cy: number,
  parts: { name: string; cut: string; variety: string; acres: string },
): PlacedLabel[] {
  const named = !!parts.name.trim() && parts.name.trim().toLowerCase() !== 'untitled'
  let minY = Infinity
  let maxY = -Infinity
  let minX = Infinity
  let maxX = -Infinity
  for (const [x, y] of ring) {
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (x < minX) minX = x
    if (x > maxX) maxX = x
  }
  const font = PRINT_FONT
  const inset = font * 0.4
  // Anchor rows to the CENTERED box (the block's wide interior around the
  // centroid), not the bbox extremes — on tilted parallelograms the top/bottom
  // of the bbox is a corner TIP and text anchored there spills the border.
  const box = centeredBox(ring, cx, cy)
  const boxH = box.h > 0 ? box.h : maxY - minY

  // Very short strips: two rows won't fit — one line, everything on it.
  if (boxH < font * 2.4) {
    const line = [named ? parts.name : '', parts.cut, parts.variety, parts.acres]
      .filter(Boolean)
      .join('  ')
    return [{ x: cx, y: cy, font, text: line, bold: false, anchor: 'middle' }]
  }

  const yTop = cy - boxH / 2 + inset + font * 0.5
  const yBot = cy + boxH / 2 - inset - font * 0.5
  const top = spanAtY(ring, yTop) ?? [minX, maxX]
  const bot = spanAtY(ring, yBot) ?? [minX, maxX]
  const labels: PlacedLabel[] = []

  if (named) {
    labels.push({ x: top[0] + inset, y: yTop, font, text: parts.name, bold: true, anchor: 'start' })
  }
  if (parts.variety) {
    labels.push({ x: top[1] - inset, y: yTop, font, text: parts.variety, bold: false, anchor: 'end' })
  }
  if (parts.acres) {
    labels.push({ x: bot[1] - inset, y: yBot, font, text: parts.acres, bold: false, anchor: 'end' })
  }
  if (parts.cut) {
    labels.push({ x: cx, y: cy, font, text: parts.cut, bold: true, anchor: 'middle' })
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
  /**
   * Highlight sheet: EVERY block prints for context, but only these ids get
   * color — `color` for a fly plan's single hue, or the active palette for a
   * layer selection. Everything else is white with black outlines and just
   * its id + acreage, so the colored blocks read against the whole farm.
   */
  highlight?: { ids: Set<string>; color?: string }
  /**
   * Which block facts to print (farm preset, per-print override). Defaults
   * to all four: name, variety, cut, acres.
   */
  labelFields?: Set<'name' | 'variety' | 'cut' | 'acres'>
  /** which palette paints colored blocks (mirrors the map's Color-by toggle) */
  paletteBy?: 'stage' | 'variety'
  /** resolved per-variety colors, required when paletteBy = 'variety' */
  varietyColors?: Record<string, string>
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
  // θ and θ+180° fill the page identically, and the 0–179° search sometimes
  // lands on the upside-down twin — a whole farm printing rotated 180° from
  // the on-screen map (Woodlawn bug: "blocks on the opposite side of the
  // page"). Prefer the twin that keeps the farm's north pointing UP the page:
  // north's rotated y-component is cos(θ), so flip when it's negative.
  if (Math.cos(bestAngle) < 0) bestAngle += Math.PI
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

    // Highlight sheets print the WHOLE farm for context: only members get
    // color; everything else is a white context block.
    const hl = opts.highlight
    const member = hl ? hl.ids.has(b.id) : true
    const fill = !member
      ? '#FFFFFF'
      : hl?.color
        ? hl.color
        : style === 'spray'
          ? '#FFFFFF'
          : opts.paletteBy === 'variety'
            ? ((b.variety && opts.varietyColors?.[b.variety]) || UNSET_RATOON_COLOR)
            : stageColorFor(b.current_ratoon, opts.stageColors ?? {})

    // Corner labels, each in its own spot (name TL, variety TR, acres BR, cut
    // center), positioned against the block's real interior walls. EVERY
    // block prints ALL FOUR facts on every sheet style — non-negotiable.
    const [lx, ly] = toXY(b.centroid_lng, b.centroid_lat)
    const wants = (f: 'name' | 'variety' | 'cut' | 'acres') =>
      !opts.labelFields || opts.labelFields.has(f)
    const labels = planCornerLabels(svgRing, lx, ly, {
      name: wants('name') ? (b.name ?? '') : '',
      cut: wants('cut') ? cutAbbrev(b.current_ratoon) : '',
      variety: wants('variety') ? varietyCode(b.variety) : '',
      acres: wants('acres') ? acreageLabel : '',
    })

    return {
      id: b.id,
      points: coords.join(' '),
      color: fill,
      labelDark: fill === '#FFFFFF',
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
      return [
        {
          kind: 'text' as const,
          x,
          y,
          text: a.text ?? '',
          color: a.color,
          // Screen px map ≈1:1 onto the 1100-unit print canvas at typical
          // farm sizes; keep the chosen size, floor for print legibility.
          size: Math.max(9, a.size ?? 16),
          rotation: a.rotation ?? 0,
        },
      ]
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
