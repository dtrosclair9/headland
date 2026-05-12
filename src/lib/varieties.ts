// Sugarcane variety reference data. Sourced from `docs/sugarcane-domain.md`.
// Hardcoded for now (small list, low churn — annual review at most). Move to a
// reference table if/when growers want to suggest varieties or admin them.

import type { CaneState } from '@/lib/types'

export type VarietyStatus = 'top' | 'active' | 'declining' | 'retired'
export type FloridaSoil = 'muck' | 'sand' | 'both'

export interface Variety {
  code: string
  state: CaneState
  series: string
  status: VarietyStatus
  /**
   * Glyphosate-as-ripener sensitivity. When true, the records UI should warn
   * before logging a Roundup ripener application on a field carrying this variety.
   */
  ripener_sensitive: boolean
  /** Florida-only soil suitability. */
  soil?: FloridaSoil
  notes?: string
}

// Sources: LSU AgCenter Sugar Research Station release notes, USDA-ARS Houma + Canal Point,
// AMSCL/FSCL acreage reports, ASSCT proceedings. Ripener-sensitivity flags come from
// LSU AgCenter recommendations (see domain doc §3.6 ripening).
export const VARIETIES: Variety[] = [
  // Louisiana — current top tier
  { code: 'L 01-299', state: 'LA', series: 'L', status: 'top', ripener_sensitive: false },
  { code: 'HoCP 14-885', state: 'LA', series: 'HoCP', status: 'top', ripener_sensitive: false },
  { code: 'L 15-306', state: 'LA', series: 'L', status: 'top', ripener_sensitive: false },
  { code: 'HoL 15-508', state: 'LA', series: 'HoL', status: 'top', ripener_sensitive: false },

  // Louisiana — active mid-tier
  { code: 'L 12-201', state: 'LA', series: 'L', status: 'active', ripener_sensitive: false },
  { code: 'HoCP 09-804', state: 'LA', series: 'HoCP', status: 'active', ripener_sensitive: true,
    notes: 'Glyphosate-ripener sensitive — avoid Roundup as a ripener.' },
  { code: 'Ho 12-615', state: 'LA', series: 'Ho', status: 'active', ripener_sensitive: true,
    notes: 'Glyphosate-ripener sensitive — avoid Roundup as a ripener.' },
  { code: 'L 14-267', state: 'LA', series: 'L', status: 'active', ripener_sensitive: true,
    notes: 'Glyphosate-ripener sensitive — avoid Roundup as a ripener.' },

  // Louisiana — declining but still in fields
  { code: 'HoCP 96-540', state: 'LA', series: 'HoCP', status: 'declining', ripener_sensitive: false,
    notes: 'Once-dominant variety; acreage declining as newer L/HoCP releases displace it.' },
  { code: 'L 99-226', state: 'LA', series: 'L', status: 'declining', ripener_sensitive: false },

  // Florida — current top tier
  { code: 'CP 96-1252', state: 'FL', series: 'CP', status: 'top', soil: 'both', ripener_sensitive: false },
  { code: 'CP 01-1372', state: 'FL', series: 'CP', status: 'top', soil: 'both', ripener_sensitive: false },
  { code: 'CP 00-1101', state: 'FL', series: 'CP', status: 'top', soil: 'muck', ripener_sensitive: false },
  { code: 'CP 03-1912', state: 'FL', series: 'CP', status: 'top', soil: 'sand', ripener_sensitive: false,
    notes: 'Bred for Florida sand soils.' },

  // Florida — active mid-tier
  { code: 'CP 89-2143', state: 'FL', series: 'CP', status: 'active', soil: 'muck', ripener_sensitive: false },
  { code: 'CP 89-2376', state: 'FL', series: 'CP', status: 'active', soil: 'muck', ripener_sensitive: false },
  { code: 'CPCL 02-0926', state: 'FL', series: 'CPCL', status: 'active', soil: 'both', ripener_sensitive: false },
]

const STATUS_ORDER: Record<VarietyStatus, number> = {
  top: 0,
  active: 1,
  declining: 2,
  retired: 3,
}

export function listVarietiesForState(state: CaneState | null): Variety[] {
  if (!state) return VARIETIES
  return VARIETIES.filter((v) => v.state === state).sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    return s !== 0 ? s : a.code.localeCompare(b.code)
  })
}

export function findVariety(code: string | null | undefined): Variety | null {
  if (!code) return null
  return VARIETIES.find((v) => v.code === code) ?? null
}

export function isRipenerSensitive(code: string | null | undefined): boolean {
  return findVariety(code)?.ripener_sensitive ?? false
}
