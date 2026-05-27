import type { FieldRow } from '@/lib/fields'
import type { Ditch } from '@/lib/types'
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

export interface SectionSvg {
  width: number
  height: number
  blocks: SvgBlock[]
  ditches: { id: string; points: string }[]
  /** ratoon stage keys present among these blocks, for the legend */
  stagesPresent: string[]
  hasUnset: boolean
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

// Project blocks (lng/lat) onto a flat white canvas — local equirectangular
// with a cos(lat) longitude correction, accurate for a single farm/section.
// North is up. No basemap; this is the plat-map schematic.
export function buildSectionSvg(
  blocks: FieldRow[],
  opts: { canvasWidth?: number; pad?: number; unitsArpents?: boolean; ditches?: Ditch[] } = {},
): SectionSvg | null {
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
  const projX = (lng: number) => lng * k

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  for (const [lng, lat] of pts) {
    const x = projX(lng)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (lat < minY) minY = lat
    if (lat > maxY) maxY = lat
  }

  const spanX = maxX - minX || 1e-6
  const spanY = maxY - minY || 1e-6
  const scale = (canvasWidth - 2 * pad) / spanX
  const height = spanY * scale + 2 * pad
  const toX = (lng: number) => pad + (projX(lng) - minX) * scale
  const toY = (lat: number) => pad + (maxY - lat) * scale // flip Y for SVG

  const stages = new Set<string>()
  let hasUnset = false

  const svgBlocks: SvgBlock[] = blocks.map((b) => {
    const outer = b.geometry?.coordinates?.[0] ?? []
    let bMinX = Infinity,
      bMaxX = -Infinity,
      bMinY = Infinity,
      bMaxY = -Infinity
    const coords = outer.map(([lng, lat]) => {
      const x = toX(lng)
      const y = toY(lat)
      if (x < bMinX) bMinX = x
      if (x > bMaxX) bMaxX = x
      if (y < bMinY) bMinY = y
      if (y > bMaxY) bMaxY = y
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    const minDim = Math.min(bMaxX - bMinX, bMaxY - bMinY)
    const fontSize = clamp(minDim * 0.16, 6, 15)

    if (b.current_ratoon) stages.add(b.current_ratoon)
    else hasUnset = true

    const acreageLabel = opts.unitsArpents
      ? Number(b.arpents_cached || 0).toFixed(2)
      : Number(b.acreage_cached || 0).toFixed(2)

    return {
      id: b.id,
      points: coords.join(' '),
      color: colorForRatoon(b.current_ratoon),
      labelX: toX(b.centroid_lng),
      labelY: toY(b.centroid_lat),
      fontSize,
      showName: minDim > 40,
      name: b.name,
      acreageLabel,
    }
  })

  // Overlay ditches that touch this section's frame. The SVG viewBox clips
  // anything past the canvas edges, so we keep a ditch if any vertex lands
  // within the block bounds and let SVG trim the rest.
  const inBounds = (lng: number, lat: number) =>
    projX(lng) >= minX && projX(lng) <= maxX && lat >= minY && lat <= maxY
  const svgDitches = (opts.ditches ?? [])
    .filter((d) => (d.geometry?.coordinates ?? []).some(([lng, lat]) => inBounds(lng, lat)))
    .map((d) => ({
      id: d.id,
      points: (d.geometry.coordinates as [number, number][])
        .map(([lng, lat]) => `${toX(lng).toFixed(1)},${toY(lat).toFixed(1)}`)
        .join(' '),
    }))

  return {
    width: canvasWidth,
    height,
    blocks: svgBlocks,
    ditches: svgDitches,
    stagesPresent: Array.from(stages),
    hasUnset,
  }
}
