import { createClient } from '@/lib/supabase/server'
import type { FieldCycleHistory, RatoonStage } from '@/lib/types'

// Advancing a block one crop year: plant cane → 1st stubble → … → 6th+.
// Terminal/special stages are intentionally NOT auto-advanced:
//   - sixth_stubble_plus is already the catch-all top bucket
//   - fallow: replanting is a decision the grower makes by hand
//   - null (no cut set): nothing to advance from
// Those are reported as "skipped" so the rotation is predictable.
const NEXT_STAGE: Partial<Record<RatoonStage, RatoonStage>> = {
  plant_cane: 'first_stubble',
  first_stubble: 'second_stubble',
  second_stubble: 'third_stubble',
  third_stubble: 'fourth_stubble',
  fourth_stubble: 'fifth_stubble_plus',
  fifth_stubble_plus: 'sixth_stubble_plus',
}

export interface RotationResult {
  advanced: number
  skipped: number
}

// Advance the given blocks (by id, and/or every active block in a section) to
// their next year cane, logging each change to field_cycle_history. RLS keeps
// this scoped to the caller's org.
export async function rotateBlocks(input: {
  orgId: string
  fieldIds?: string[]
  sectionId?: string
  cropYear?: number
}): Promise<RotationResult> {
  const supabase = await createClient()
  const cropYear = input.cropYear ?? new Date().getFullYear()

  // Gather the target fields' current stages.
  let query = supabase
    .from('fields')
    .select('id, current_ratoon')
    .eq('org_id', input.orgId)
    .is('archived_at', null)

  if (input.sectionId && input.fieldIds?.length) {
    query = query.or(
      `section_id.eq.${input.sectionId},id.in.(${input.fieldIds.join(',')})`,
    )
  } else if (input.sectionId) {
    query = query.eq('section_id', input.sectionId)
  } else if (input.fieldIds?.length) {
    query = query.in('id', input.fieldIds)
  } else {
    return { advanced: 0, skipped: 0 }
  }

  const { data: rows, error } = await query
  if (error) throw error

  const targets = (rows ?? []) as { id: string; current_ratoon: RatoonStage | null }[]

  // Group field ids by the stage they'll move TO so each advance is one update.
  const byNextStage = new Map<RatoonStage, string[]>()
  const historyRows: Array<{
    field_id: string
    crop_year: number
    previous_stage: RatoonStage | null
    new_stage: RatoonStage
  }> = []
  let skipped = 0

  for (const f of targets) {
    const next = f.current_ratoon ? NEXT_STAGE[f.current_ratoon] : undefined
    if (!next) {
      skipped++
      continue
    }
    const list = byNextStage.get(next) ?? []
    list.push(f.id)
    byNextStage.set(next, list)
    historyRows.push({
      field_id: f.id,
      crop_year: cropYear,
      previous_stage: f.current_ratoon,
      new_stage: next,
    })
  }

  let advanced = 0
  for (const [nextStage, ids] of byNextStage) {
    const { error: updErr, count } = await supabase
      .from('fields')
      .update({ current_ratoon: nextStage }, { count: 'exact' })
      .in('id', ids)
    if (updErr) throw updErr
    advanced += count ?? ids.length
  }

  if (historyRows.length > 0) {
    const { error: histErr } = await supabase.from('field_cycle_history').insert(historyRows)
    if (histErr) throw histErr
  }

  return { advanced, skipped }
}

export async function getFieldCycleHistory(fieldId: string): Promise<FieldCycleHistory[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('field_cycle_history')
    .select('*')
    .eq('field_id', fieldId)
    .order('crop_year', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as FieldCycleHistory[]
}
