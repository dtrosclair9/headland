import type { FieldRow } from '@/lib/fields'

// The grower's layer selection, FarmWorks-style. Within a group the values are
// OR'd (plant cane OR 1st stubble); across groups they're AND'd (plant cane AND
// variety 299 AND Rosedale). Empty groups don't constrain. All groups empty =
// no filter, the whole farm renders as usual.
export interface LayerFilter {
  /** ratoon stage keys; 'unset' matches blocks with no cut entered */
  stages: string[]
  /** exact variety strings; '' matches blocks with no variety */
  varieties: string[]
  /** plantation ids; null matches unassigned blocks */
  plantations: (string | null)[]
}

export const EMPTY_LAYER_FILTER: LayerFilter = { stages: [], varieties: [], plantations: [] }

export function isLayerFilterActive(f: LayerFilter): boolean {
  return f.stages.length > 0 || f.varieties.length > 0 || f.plantations.length > 0
}

export function fieldMatchesFilter(field: FieldRow, f: LayerFilter): boolean {
  if (f.stages.length > 0 && !f.stages.includes(field.current_ratoon ?? 'unset')) return false
  if (f.varieties.length > 0 && !f.varieties.includes(field.variety ?? '')) return false
  if (f.plantations.length > 0 && !f.plantations.includes(field.plantation_id ?? null)) return false
  return true
}
