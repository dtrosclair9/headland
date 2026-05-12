// Acres are the universal default. Arpents are a Louisiana French unit
// still used on cane farm deeds (1 LA arpent ≈ 0.84628 acres ≈ 0.3424 ha).
import type { Units } from '@/lib/types'

export const ARPENT_PER_ACRE = 1 / 0.84628
export const ACRES_PER_SQ_METER = 1 / 4046.8564224

export function squareMetersToAcres(sqm: number): number {
  return sqm * ACRES_PER_SQ_METER
}

export function acresToArpents(acres: number): number {
  return acres * ARPENT_PER_ACRE
}

export function formatAcres(acres: number): string {
  return `${acres.toFixed(2)} ac`
}

export function formatArpents(acres: number): string {
  return `${acresToArpents(acres).toFixed(2)} arp`
}

// Render a number of acres in the org's preferred unit, with the alternate in muted parens.
// e.g. "150.00 ac (177.30 arp)" or "177.30 arp (150.00 ac)"
export function formatArea(acres: number, units: Units): { primary: string; alt: string } {
  if (units === 'arpents') {
    return { primary: formatArpents(acres), alt: formatAcres(acres) }
  }
  return { primary: formatAcres(acres), alt: formatArpents(acres) }
}

export const UNIT_LABELS: Record<Units, string> = {
  acres: 'Acres',
  arpents: 'Arpents (Louisiana)',
}
