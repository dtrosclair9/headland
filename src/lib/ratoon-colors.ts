// Single source of truth for the grower's crop-stage color convention.
// Used by the interactive crop map (FieldMap) and the printed section map.
// See memory: cane crop-stage color convention.

export const RATOON_COLORS: { key: string; label: string; color: string }[] = [
  { key: 'plant_cane', label: 'Plant cane', color: '#DC2626' }, // red
  { key: 'first_stubble', label: '1st stubble', color: '#2563EB' }, // blue
  { key: 'second_stubble', label: '2nd stubble', color: '#EAB308' }, // yellow
  { key: 'third_stubble', label: '3rd stubble', color: '#16A34A' }, // green
  { key: 'fourth_stubble', label: '4th stubble', color: '#92400E' }, // brown
  { key: 'fifth_stubble_plus', label: '5th stubble', color: '#EC4899' }, // pink
  { key: 'sixth_stubble_plus', label: '6th+ stubble', color: '#7C3AED' }, // purple
  { key: 'fallow', label: 'Fallow / open', color: '#9CA3AF' }, // grey
]

// No cut entered yet — cyan. A unique color (not in the cut palette) that stays
// clearly visible on BOTH the satellite and the white crop-map canvas, unlike a
// grey or white which disappear against one or the other.
export const UNSET_RATOON_COLOR = '#06B6D4'

export function colorForRatoon(stage: string | null | undefined): string {
  if (!stage) return UNSET_RATOON_COLOR
  return RATOON_COLORS.find((r) => r.key === stage)?.color ?? UNSET_RATOON_COLOR
}
