import { createClient } from '@/lib/supabase/server'
import type { RatoonStage } from '@/lib/types'
import { chunkIds } from '@/lib/chunk-ids'
import { paginateAll } from '@/lib/paginate'

// Bulk "Assign to…" from the map's select mode: set the same variety or the
// same cycle (year cane) on many blocks at once. Mirrors rotateBlocks'
// safety pattern — fetch the org's blocks by ORG (paginated past the
// 1000-row cap, never a giant id list in a URL), filter to the requested ids
// in JS, then chunked org-scoped updates.
export async function bulkEditFields(input: {
  orgId: string
  fieldIds: string[]
  set: { variety: string | null } | { cycle: RatoonStage | null }
}): Promise<number> {
  if (input.fieldIds.length === 0) return 0
  const supabase = await createClient()

  const rows = await paginateAll<{ id: string; current_ratoon: RatoonStage | null }>(
    (from, to) =>
      supabase
        .from('fields')
        .select('id, current_ratoon')
        .eq('org_id', input.orgId)
        .is('archived_at', null)
        .range(from, to),
  )
  const want = new Set(input.fieldIds)
  const targets = rows.filter((r) => want.has(r.id))
  if (targets.length === 0) return 0

  let updated = 0
  const patch =
    'variety' in input.set
      ? { variety: input.set.variety }
      : { current_ratoon: input.set.cycle }
  for (const slice of chunkIds(targets.map((t) => t.id))) {
    const { error, count } = await supabase
      .from('fields')
      .update(patch, { count: 'exact' })
      .eq('org_id', input.orgId)
      .in('id', slice)
    if (error) throw error
    updated += count ?? slice.length
  }

  // Setting a cycle is an operational fact like a rotation — record the
  // transition per block so the Operations feed shows it. Clearing the cut
  // (null) is a data correction, not a season event: no history rows.
  if ('cycle' in input.set && input.set.cycle) {
    const stage = input.set.cycle
    const cropYear = new Date().getFullYear()
    const historyRows = targets
      .filter((t) => t.current_ratoon !== stage)
      .map((t) => ({
        field_id: t.id,
        crop_year: cropYear,
        previous_stage: t.current_ratoon,
        new_stage: stage,
      }))
    if (historyRows.length > 0) {
      const { error } = await supabase.from('field_cycle_history').insert(historyRows)
      if (error) throw error
    }
  }

  return updated
}
