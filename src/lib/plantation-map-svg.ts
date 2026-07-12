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
  /** degrees — vertical labels run down tall narrow blocks */
  rotation?: number
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

/**
 * A block too small to hold its facts gets a plat-map style callout: a white
 * chip placed in nearby open canvas with a leader line pointing into the
 * block. Everything stays ON the map — no footer index stealing map height.
 */
export interface SvgCallout {
  /** leader line: block anchor → chip edge */
  x1: number
  y1: number
  x2: number
  y2: number
  box: { x: number; y: number; w: number; h: number }
  /** bold lead (block id) — empty when the id already printed inside the block */
  bold: string
  /** the facts line */
  text: string
  font: number
}

export interface PlantationSvg {
  width: number
  height: number
  blocks: SvgBlock[]
  annotations: SvgAnnotation[]
  /** leader-line callouts for blocks whose facts couldn't fit inside */
  callouts: SvgCallout[]
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

// Per-glyph advance as a fraction of font size (Inter/system sans) — our
// labels are digit-heavy ("838·4.05"), and digits, dots, and spaces run much
// narrower than a flat per-char average. Measuring per glyph is the
// difference between a block fitting its line and getting exiled to a callout.
const GLYPH_W: Record<string, number> = { ' ': 0.3, '.': 0.3, '·': 0.36 }
function textW(t: string, f: number): number {
  let u = 0
  for (const ch of t) u += GLYPH_W[ch] ?? (ch >= '0' && ch <= '9' ? 0.6 : 0.64)
  return u * f
}

// NON-NEGOTIABLE RULE: every block prints all four facts — id, acres,
// variety, cycle — on every sheet, at a constant PHYSICAL size (~6.5pt,
// old-farmer-readable). Font is computed per paper size: on legal the same
// 1100-unit canvas maps to a wider sheet, so the font takes fewer canvas
// units and blocks gain relative room — bigger paper genuinely fits more.
export type PaperSize = 'letter' | 'legal' | 'tabloid'
// Physical sheet in LANDSCAPE orientation (width × height, inches). Adding a
// paper size is one line here — everything downstream (font scale, aspect,
// sheet CSS, @page rule) derives from these dims.
export const PAPER_DIMS: Record<PaperSize, { w: number; h: number; label: string }> = {
  letter: { w: 11, h: 8.5, label: 'Letter' },
  legal: { w: 14, h: 8.5, label: 'Legal' },
  tabloid: { w: 17, h: 11, label: '11×17' },
}
const PAGE_MARGIN_IN = 0.3 // @page margin, all sides
const SHEET_PAD_IN = 0.15 // .sheet horizontal padding
const CHROME_IN = 0.7 // thin header + paddings above/below the map
export function paperSpec(paper: PaperSize) {
  const d = PAPER_DIMS[paper]
  const sheetWidthIn = d.w - PAGE_MARGIN_IN * 2
  return {
    sheetWidthIn,
    widthIn: sheetWidthIn - SHEET_PAD_IN * 2, // printable map width
    heightIn: d.h - PAGE_MARGIN_IN * 2 - CHROME_IN, // printable map height
    pageW: d.w,
    pageH: d.h,
    label: d.label,
  }
}
export function parsePaperSize(raw: string | undefined): PaperSize {
  return raw === 'legal' || raw === 'tabloid' ? raw : raw === 'ledger' ? 'tabloid' : 'letter'
}
const FONT_PT = 6.5
function printFontUnits(paper: PaperSize, canvasWidth: number): number {
  return (FONT_PT / 72) * (canvasWidth / paperSpec(paper).widthIn)
}

// The block's own long axis: try each edge direction, keep the orientation
// whose bounding box has the least area (classic min-area oriented box).
// Returns the axis angle in degrees, normalized to (-90, 90] so text along
// it is never upside down.
function longAxisAngle(ring: [number, number][], cx: number, cy: number): number {
  let bestAngle = 0
  let bestArea = Infinity
  for (let i = 0; i < ring.length - 1; i++) {
    const dx = ring[i + 1][0] - ring[i][0]
    const dy = ring[i + 1][1] - ring[i][1]
    if (dx === 0 && dy === 0) continue
    const a = Math.atan2(dy, dx)
    const c = Math.cos(-a)
    const sn = Math.sin(-a)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [px, py] of ring) {
      const rx = (px - cx) * c - (py - cy) * sn
      const ry = (px - cx) * sn + (py - cy) * c
      if (rx < minX) minX = rx
      if (rx > maxX) maxX = rx
      if (ry < minY) minY = ry
      if (ry > maxY) maxY = ry
    }
    const w = maxX - minX
    const h = maxY - minY
    const area = w * h
    // Prefer the orientation where the EDGE direction is the long side.
    const angle = w >= h ? a : a + Math.PI / 2
    if (area < bestArea) {
      bestArea = area
      bestAngle = angle
    }
  }
  let deg = (bestAngle * 180) / Math.PI
  while (deg > 90) deg -= 180
  while (deg <= -90) deg += 180
  return deg
}

// Standard even-odd ray cast.
function pointInRing(ring: [number, number][], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

// Rotate a point by `deg` around (cx, cy) — SVG coords, y down.
function rotatePoint(x: number, y: number, cx: number, cy: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const sn = Math.sin(r)
  const dx = x - cx
  const dy = y - cy
  return [cx + dx * c - dy * sn, cy + dx * sn + dy * c]
}

// Place a block's labels. No two blocks are the same shape, so this walks a
// ladder of layouts (the same one ArcGIS Maplex / QGIS use for small
// parcels), most spacious first:
//   1. page-aligned corners (name TL, variety TR, acres BR, cut center)
//   2. in the block's OWN frame (its min-area long axis): two rails hugging
//      the long edges — the slim-strip layout
//   3. one combined line down the middle of the long axis
//   4. stacked short rows across the short axis — the short-fat-block layout
//   5. retry 2–4 one gentle font step down (~0.9×, still farmer-readable)
//   6. leader-line callout: bold id inside if it fits, facts on a white chip
//      in nearby open canvas with a line pointing into the block
// Every block gets all four facts ON THE MAP, always.
function planCornerLabels(
  ring: [number, number][],
  cx: number,
  cy: number,
  parts: { name: string; cut: string; variety: string; acres: string },
  font: number,
): { labels: PlacedLabel[]; callout: { bold: string; text: string } | null } {
  const named = !!parts.name.trim() && parts.name.trim().toLowerCase() !== 'untitled'
  const inset = font * 0.4
  const w = (t: string) => textW(t, font)

  // ── 1. Page-aligned corner layout (the normal case for full-size blocks) ──
  const box = centeredBox(ring, cx, cy)
  const boxH = box.h
  const room = Math.max(0, box.w - 2 * inset)
  const yTopProbe = cy - boxH / 2 + inset + font * 0.5
  const yBotProbe = cy + boxH / 2 - inset - font * 0.5
  const spanW = (y: number) => {
    const sp = spanAtY(ring, y)
    return sp ? Math.max(0, sp[1] - sp[0] - 2 * inset) : room
  }
  const topRoom = Math.min(room, spanW(yTopProbe))
  const botRoom = Math.min(room, spanW(yBotProbe))
  const topNeeded =
    (named ? w(parts.name) : 0) +
    (parts.variety ? w(parts.variety) : 0) +
    (named && parts.variety ? font : 0)
  // Corners need comfortable room for three bands (top row, cut, bottom row);
  // anything tighter reads better as rails along the block's axis.
  const cornersFit =
    boxH >= font * 3.4 && topNeeded <= topRoom && w(parts.acres) <= botRoom && w(parts.cut) <= box.w

  if (cornersFit) {
    const yTop = yTopProbe
    const yBot = yBotProbe
    const top = spanAtY(ring, yTop) ?? [cx - box.w / 2, cx + box.w / 2]
    const bot = spanAtY(ring, yBot) ?? [cx - box.w / 2, cx + box.w / 2]
    const labels: PlacedLabel[] = []
    if (named)
      labels.push({ x: top[0] + inset, y: yTop, font, text: parts.name, bold: true, anchor: 'start' })
    if (parts.variety)
      labels.push({ x: top[1] - inset, y: yTop, font, text: parts.variety, bold: false, anchor: 'end' })
    if (parts.acres)
      labels.push({ x: bot[1] - inset, y: yBot, font, text: parts.acres, bold: false, anchor: 'end' })
    if (parts.cut)
      labels.push({ x: cx, y: cy, font, text: parts.cut, bold: true, anchor: 'middle' })
    return { labels, callout: null }
  }

  // ── 2–5. Work in the block's own frame: rotate so its long axis is x ──
  const axis = longAxisAngle(ring, cx, cy)
  const frameRing = ring.map(([px, py]) => rotatePoint(px, py, cx, cy, -axis)) as [number, number][]
  const fbox = centeredBox(frameRing, cx, cy)

  // Tight '·' separators — " · " padding costs ~30% of a line's width, which
  // on dense farms is the difference between in-block text and a callout.
  const facts = [parts.cut, parts.variety, parts.acres].filter(Boolean).join('·')
  const fullLine = [named ? parts.name : '', facts].filter(Boolean).join('  ')
  const leftLine = [named ? parts.name : '', parts.cut].filter(Boolean).join(' ')
  const rightLine = [parts.variety, parts.acres].filter(Boolean).join('·')

  const emit = (fx: number, fy: number, text: string, bold: boolean, f: number): PlacedLabel => {
    const [x, y] = rotatePoint(fx, fy, cx, cy, axis)
    return { x, y, font: f, text, bold, anchor: 'middle', rotation: axis }
  }

  // One layout attempt at font f — rails, then single line, then stacked rows.
  const tryFrame = (f: number): PlacedLabel[] | null => {
    const wf = (t: string) => textW(t, f)
    const insetF = f * 0.4
    const longAvail = Math.max(0, fbox.w - 2 * insetF)
    const shortAvail = fbox.h

    // Two rails hugging the long edges — slim strips.
    if (
      leftLine &&
      rightLine &&
      shortAvail >= f * 2.8 &&
      wf(leftLine) <= longAvail &&
      wf(rightLine) <= longAvail
    ) {
      const off = shortAvail / 2 - insetF - f * 0.5
      return [emit(cx, cy - off, leftLine, true, f), emit(cx, cy + off, rightLine, false, f)]
    }

    // One line down the middle of the long axis.
    if (fullLine && shortAvail >= f * 1.2 && wf(fullLine) <= longAvail) {
      return [emit(cx, cy, fullLine, true, f)]
    }

    // Stacked short rows across the short axis — short fat blocks that can't
    // carry one long line but have height for two, three, or four rows.
    const rows: string[][] = [
      [leftLine, rightLine],
      [named ? parts.name : '', [parts.cut, parts.variety].filter(Boolean).join('·'), parts.acres],
      [named ? parts.name : '', parts.cut, parts.variety, parts.acres],
    ]
    for (const raw of rows) {
      const lines = raw.filter(Boolean)
      if (lines.length < 2) continue
      const lineH = f * 1.1
      if (lines.length * lineH > shortAvail - insetF) continue
      if (!lines.every((t) => wf(t) <= longAvail)) continue
      const y0 = cy - ((lines.length - 1) / 2) * lineH
      return lines.map((t, i) => emit(cx, y0 + i * lineH, t, i === 0 && named, f))
    }
    return null
  }

  // Base size first, then two gentle steps down (6.5 → ~6 → ~5.5pt) — never
  // smaller; below that a callout is more readable than shrunken text.
  for (const f of [font, font * 0.92, font * 0.85]) {
    const labels = tryFrame(f)
    if (labels) return { labels, callout: null }
  }

  // ── 6. Callout: bold id inside the block if it fits, facts on a chip ──
  const insetF = font * 0.36
  const longAvail = Math.max(0, fbox.w - 2 * insetF)
  const shortAvail = fbox.h
  const idFont = clamp(
    longAvail > 0 ? (longAvail / Math.max(1, textW(parts.name, 1))) : font,
    font * 0.8,
    font,
  )
  const idFits = named && textW(parts.name, idFont) <= longAvail && shortAvail >= idFont * 0.9
  const labels: PlacedLabel[] = idFits
    ? [
        {
          x: cx,
          y: cy,
          font: idFont,
          text: parts.name,
          bold: true,
          anchor: 'middle',
          rotation: shortAvail < idFont * 1.1 || w(parts.name) > box.w ? axis : 0,
        },
      ]
    : []
  if (!facts && idFits) return { labels, callout: null }
  return {
    labels,
    // If the id printed inside, the chip carries just the facts (the leader
    // ties them together); otherwise the chip leads with the bold id.
    callout: { bold: idFits ? '' : parts.name, text: facts || parts.name },
  }
}

// The farm is auto-rotated to best fill the printable area, so a long
// diagonal farm prints across the page (like FarmWorks). Aspect comes from
// the chosen paper's printable map area.
function printAreaAspect(paper: PaperSize): number {
  const p = paperSpec(paper)
  return p.widthIn / p.heightIn
}

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
  /** paper the sheet prints on — drives physical font size + page-fit aspect */
  paper?: PaperSize
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
  const paper: PaperSize = opts.paper ?? 'letter'
  const aspect = printAreaAspect(paper)
  const font = printFontUnits(paper, canvasWidth)

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
    const score = Math.min(aspect / w, 1 / h)
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
  // Blocks whose facts didn't fit inside — they get leader-line callouts
  // placed in a global pass once every block's geometry + labels are known.
  const pending: {
    anchorX: number
    anchorY: number
    radius: number
    bold: string
    text: string
  }[] = []
  const rings: [number, number][][] = []

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
    const { labels, callout } = planCornerLabels(
      svgRing,
      lx,
      ly,
      {
        name: wants('name') ? (b.name ?? '') : '',
        cut: wants('cut') ? cutAbbrev(b.current_ratoon) : '',
        variety: wants('variety') ? varietyCode(b.variety) : '',
        acres: wants('acres') ? acreageLabel : '',
      },
      font,
    )
    rings.push(svgRing)
    if (callout) {
      let radius = 0
      for (const [px, py] of svgRing) {
        const d = Math.hypot(px - lx, py - ly)
        if (d > radius) radius = d
      }
      pending.push({ anchorX: lx, anchorY: ly, radius, bold: callout.bold, text: callout.text })
    }

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

  // ── Callout placement pass ──────────────────────────────────────────────
  // For each sliver block, find open canvas near it for a white chip: sample
  // candidate spots ringed around the block and score them — landing on
  // another block is bad, covering someone's labels is bad, covering another
  // chip is forbidden, closer is better. The best spot wins; the chip gets a
  // leader line back into the block. This is how paper plat maps handle
  // parcels too small for their text.
  const ringBoxes: Rect[] = rings.map((r) => {
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity
    for (const [px, py] of r) {
      if (px < mnx) mnx = px
      if (px > mxx) mxx = px
      if (py < mny) mny = py
      if (py > mxy) mxy = py
    }
    return { x: mnx, y: mny, w: mxx - mnx, h: mxy - mny }
  })
  const labelRects: Rect[] = svgBlocks.flatMap((b) =>
    b.labels.map((l) => {
      const w = textW(l.text, l.font)
      const x = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - w : l.x - w / 2
      return { x, y: l.y - l.font * 0.7, w, h: l.font * 1.4 }
    }),
  )
  const chips: Rect[] = []
  const callouts: SvgCallout[] = []
  pending.sort((a, b) => a.anchorY - b.anchorY || a.anchorX - b.anchorX)
  for (const p of pending) {
    const chipW = textW(p.bold, font) * 1.08 + (p.bold ? textW(' ', font) : 0) + textW(p.text, font) + font * 0.9
    const chipH = font * 1.6
    let best: Rect | null = null
    let bestScore = Infinity
    for (const mult of [1, 1.8, 2.7, 3.7, 4.8]) {
      for (let ai = 0; ai < 12; ai++) {
        const a = (ai * Math.PI) / 6
        const dirX = Math.cos(a)
        const dirY = Math.sin(a)
        // Near edge of the chip sits ~gap past the block's extent.
        const reach =
          p.radius + font * 0.9 * mult + (Math.abs(dirX) * chipW) / 2 + (Math.abs(dirY) * chipH) / 2
        const rect: Rect = {
          x: p.anchorX + dirX * reach - chipW / 2,
          y: p.anchorY + dirY * reach - chipH / 2,
          w: chipW,
          h: chipH,
        }
        if (rect.x < 2 || rect.y < 2 || rect.x + rect.w > canvasWidth - 2 || rect.y + rect.h > height - 2)
          continue
        if (chips.some((c) => rectsOverlap(c, rect))) continue
        let score = (mult - 1) * 18 + (ai % 3 === 0 ? 0 : 3) // close + cardinal preferred
        // Sample 9 points; each landing inside a block costs — the chip has a
        // solid white background so it stays readable, but open ground wins.
        for (const sx of [rect.x, rect.x + rect.w / 2, rect.x + rect.w]) {
          for (const sy of [rect.y, rect.y + rect.h / 2, rect.y + rect.h]) {
            for (let ri = 0; ri < rings.length; ri++) {
              const bb = ringBoxes[ri]
              if (sx < bb.x || sx > bb.x + bb.w || sy < bb.y || sy > bb.y + bb.h) continue
              if (pointInRing(rings[ri], sx, sy)) {
                score += 14
                break
              }
            }
          }
        }
        for (const lr of labelRects) if (rectsOverlap(lr, rect)) score += 80
        if (score < bestScore) {
          bestScore = score
          best = rect
        }
      }
      if (best && bestScore <= (mult - 1) * 18 + 3) break // clean spot at this distance
    }
    // Every candidate collided (dense corner of the farm): drop the chip just
    // above the block, clamped on-canvas — readable beats invisible.
    if (!best) {
      best = {
        x: clamp(p.anchorX - chipW / 2, 2, canvasWidth - chipW - 2),
        y: clamp(p.anchorY - p.radius - chipH - font * 0.5, 2, height - chipH - 2),
        w: chipW,
        h: chipH,
      }
    }
    chips.push(best)
    labelRects.push(best)
    // Leader from the block anchor to the nearest point on the chip edge.
    const ex = clamp(p.anchorX, best.x, best.x + best.w)
    const ey = clamp(p.anchorY, best.y, best.y + best.h)
    callouts.push({
      x1: p.anchorX,
      y1: p.anchorY,
      x2: ex,
      y2: ey,
      box: best,
      bold: p.bold,
      text: p.text,
      font,
    })
  }

  return {
    width: canvasWidth,
    height,
    blocks: svgBlocks,
    annotations: svgAnnotations,
    callouts,
    stagesPresent: Array.from(stages),
    hasUnset,
  }
}
