import { createClient } from '@/lib/supabase/server'
import type { Plantation } from '@/lib/types'
import { paginateAll } from '@/lib/paginate'

// One plantation, plus a denormalized count of how many active (un-archived)
// fields are currently assigned to it, and the distinct FSA tracts those
// blocks carry (per-block tract is authoritative — a plantation can span
// several). Both are for the management UI, avoiding N+1 round-trips.
export interface PlantationWithCount extends Plantation {
  field_count: number
  block_tracts: string[]
}

export async function listPlantations(orgId: string): Promise<PlantationWithCount[]> {
  const supabase = await createClient()
  // Two queries instead of a nested PostgREST select — nested filters on
  // joined rows can be flaky and silently drop the archived-at filter.
  // Fields are paginated past the 1000-row PostgREST cap (big farms).
  const [plantationsRes, fieldRows] = await Promise.all([
    supabase
      .from('plantations')
      .select('*')
      .eq('org_id', orgId)
      .is('archived_at', null)
      .order('name', { ascending: true }),
    paginateAll<{ plantation_id: string | null; fsa_tract_number: string | null }>((from, to) =>
      supabase
        .from('fields')
        .select('plantation_id, fsa_tract_number')
        .eq('org_id', orgId)
        .is('archived_at', null)
        .not('plantation_id', 'is', null)
        .range(from, to),
    ),
  ])
  if (plantationsRes.error) throw plantationsRes.error

  const counts = new Map<string, number>()
  const tracts = new Map<string, Set<string>>()
  for (const row of fieldRows) {
    if (!row.plantation_id) continue
    counts.set(row.plantation_id, (counts.get(row.plantation_id) ?? 0) + 1)
    if (row.fsa_tract_number) {
      const set = tracts.get(row.plantation_id) ?? new Set<string>()
      set.add(row.fsa_tract_number)
      tracts.set(row.plantation_id, set)
    }
  }

  return ((plantationsRes.data ?? []) as Plantation[]).map((s) => ({
    ...s,
    field_count: counts.get(s.id) ?? 0,
    block_tracts: [...(tracts.get(s.id) ?? [])].sort(),
  }))
}

export async function getPlantation(plantationId: string): Promise<Plantation | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plantations')
    .select('*')
    .eq('id', plantationId)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as Plantation | null
}

export async function createPlantation(input: {
  orgId: string
  name: string
  fsa_tract_number?: string | null
  fsa_farm_number?: string | null
  notes?: string | null
}): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plantations')
    .insert({
      org_id: input.orgId,
      name: input.name,
      fsa_tract_number: input.fsa_tract_number ?? null,
      fsa_farm_number: input.fsa_farm_number ?? null,
      notes: input.notes ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return { id: data.id as string }
}

export async function updatePlantation(
  plantationId: string,
  patch: {
    name?: string
    fsa_tract_number?: string | null
    fsa_farm_number?: string | null
    notes?: string | null
  },
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('plantations').update(patch).eq('id', plantationId)
  if (error) throw error
}

export async function archivePlantation(plantationId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('plantations')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', plantationId)
  if (error) throw error
}
