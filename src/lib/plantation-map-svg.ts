import type { FieldRow } from '@/lib/fields'
import { colorForRatoon } from '@/lib/ratoon-colors'

export interface SvgBlock {
  id: string
  points: string
  color: string
  labelX: number
  labelY: number
  fontSize: number
  showName: boolean
  name: string
  acreageLabel: string
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
    const coords = outer.map(([lng, lat]) => {
      const [x, y] = toXY(lng, lat)
      if (x < bMinX) bMinX = x
      if (x > bMaxX) bMaxX = x
      if (y < bMinY) bMinY = y
      if (y > bMaxY) bMaxY = y
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    const minDim = Math.min(bMaxX - bMinX, bMaxY - bMinY)
    // Spray sheets must name every block, so they allow a smaller font floor to
    // fit slivers; the crop sheet keeps a larger floor and hides tiny names.
    const fontSize = clamp(minDim * 0.16, style === 'spray' ? 4.5 : 6, 15)

    if (b.current_ratoon) stages.add(b.current_ratoon)
    else hasUnset = true

    const acreageLabel = opts.unitsArpents
      ? Number(b.arpents_cached || 0).toFixed(2)
      : Number(b.acreage_cached || 0).toFixed(2)

    const [lx, ly] = toXY(b.centroid_lng, b.centroid_lat)
    return {
      id: b.id,
      points: coords.join(' '),
      color: style === 'spray' ? '#FFFFFF' : colorForRatoon(b.current_ratoon),
      labelX: lx,
      labelY: ly,
      fontSize,
      showName: style === 'spray' ? true : minDim > 40,
      name: b.name,
      acreageLabel,
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
