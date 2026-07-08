// Client-safe color resolution: built-in defaults + the farm's overrides.
// Everything that paints blocks (map, sidebar dots, legends, prints) resolves
// through here so a custom color applies everywhere at once.

import { RATOON_COLORS, UNSET_RATOON_COLOR } from './ratoon-colors'
import { defaultVarietyColors } from './variety-colors'

export interface StageColor {
  key: string
  label: string
  color: string
}

export function resolveStageColors(overrides: Record<string, string>): StageColor[] {
  return RATOON_COLORS.map((r) => ({ ...r, color: overrides[r.key] ?? r.color }))
}

export function resolveStageColorMap(overrides: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of RATOON_COLORS) out[r.key] = overrides[r.key] ?? r.color
  return out
}

export function resolveVarietyColors(
  varieties: (string | null)[],
  overrides: Record<string, string>,
): Record<string, string> {
  const defaults = defaultVarietyColors(varieties.map((v) => v ?? ''))
  const out: Record<string, string> = { ...defaults }
  for (const [k, c] of Object.entries(overrides)) {
    // Only apply overrides for varieties actually on the farm.
    if (k in defaults) out[k] = c
  }
  return out
}

export function stageColorFor(
  stage: string | null | undefined,
  overrides: Record<string, string>,
): string {
  if (!stage) return UNSET_RATOON_COLOR
  return overrides[stage] ?? RATOON_COLORS.find((r) => r.key === stage)?.color ?? UNSET_RATOON_COLOR
}
