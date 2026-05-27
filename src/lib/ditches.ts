import { createClient } from '@/lib/supabase/server'
import type { Ditch } from '@/lib/types'

// Ditches are drawn lines stored as GeoJSON LineString (jsonb) — no acreage
// math, so no PostGIS round-trip needed. Org-scoped via RLS.
export async function listDitches(orgId: string): Promise<Ditch[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ditches')
    .select('*')
    .eq('org_id', orgId)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Ditch[]
}

export async function createDitch(input: {
  orgId: string
  geometry: GeoJSON.LineString
  notes?: string | null
}): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ditches')
    .insert({
      org_id: input.orgId,
      geometry: input.geometry as unknown as Record<string, unknown>,
      notes: input.notes ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return { id: data.id as string }
}

export async function archiveDitch(ditchId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('ditches')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', ditchId)
  if (error) throw error
}
