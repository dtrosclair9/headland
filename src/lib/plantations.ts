import { createClient } from '@/lib/supabase/server'
import type { Plantation } from '@/lib/types'

// One plantation, plus a denormalized count of how many active (un-archived)
// fields are currently assigned to it. The count is useful for the
// management UI and avoids an N+1 round-trip per plantation.
export interface PlantationWithCount extends Plantation {
  field_count: number
}

export async function listPlantations(orgId: string): Promise<PlantationWithCount[]> {
  const supabase = await createClient()
  // Two queries instead of a nested PostgREST select — nested filters on
  // joined rows can be flaky and silently drop the archived-at filter.
  const [plantationsRes, fieldRes] = await Promise.all([
    supabase
      .from('plantations')
      .select('*')
      .eq('org_id', orgId)
      .is('archived_at', null)
      .order('name', { ascending: true }),
    supabase
      .from('fields')
      .select('plantation_id')
      .eq('org_id', orgId)
      .is('archived_at', null)
      .not('plantation_id', 'is', null),
  ])
  if (plantationsRes.error) throw plantationsRes.error
  if (fieldRes.error) throw fieldRes.error

  const counts = new Map<string, number>()
  for (const row of (fieldRes.data ?? []) as { plantation_id: string | null }[]) {
    if (!row.plantation_id) continue
    counts.set(row.plantation_id, (counts.get(row.plantation_id) ?? 0) + 1)
  }

  return ((plantationsRes.data ?? []) as Plantation[]).map((s) => ({
    ...s,
    field_count: counts.get(s.id) ?? 0,
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
