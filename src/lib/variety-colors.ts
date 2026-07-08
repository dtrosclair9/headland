// Default block colors when the map is colored by VARIETY instead of year
// cane. Filters pick which blocks highlight; "color by" picks which palette
// paints them — that's how a stage filter and a variety filter can stack
// without their colors fighting. These defaults are assigned alphabetically
// and become per-farm editable when custom color settings land.

import { UNSET_RATOON_COLOR } from './ratoon-colors'

// Distinct, print-friendly hues (deliberately different order from the cut
// palette so a variety map doesn't look like a crop map at a glance).
export const VARIETY_PALETTE = [
  '#7C3AED', // purple
  '#EA580C', // orange
  '#16A34A', // green
  '#2563EB', // blue
  '#BE185D', // magenta
  '#CA8A04', // dark yellow
  '#DC2626', // red
  '#65A30D', // lime
  '#9333EA', // violet
  '#B45309', // amber brown
  // Cyan-family last — they sit near the "not set" cyan, so they only appear
  // on farms running 10+ varieties.
  '#0D9488', // teal
  '#0891B2', // cyan
]

// Stable per-farm assignment: varieties sorted naturally, colors cycle.
export function defaultVarietyColors(varieties: string[]): Record<string, string> {
  const distinct = Array.from(new Set(varieties.filter((v) => v.trim() !== ''))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )
  const out: Record<string, string> = {}
  distinct.forEach((v, i) => {
    out[v] = VARIETY_PALETTE[i % VARIETY_PALETTE.length]
  })
  return out
}

export const NO_VARIETY_COLOR = UNSET_RATOON_COLOR
