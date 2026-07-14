import { createClient } from '@/lib/supabase/server'
import type { Field, RatoonStage } from '@/lib/types'
import { openTaskCountsByFieldIds } from '@/lib/block-tasks'

export async function countActiveFields(orgId: string): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('fields')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .is('archived_at', null)
  if (error) throw error
  return count ?? 0
}

// What the fields_view exposes. geometry is GeoJSON.Polygon serialized as JSONB.
// plantation_name is denormalized from the join in fields_view for cheap grouping.
export interface FieldRow extends Omit<Field, 'geometry'> {
  geometry: GeoJSON.Polygon
  centroid_lng: number
  centroid_lat: number
  plantation_name: string | null
  // Open to-do count, populated by listFields for the map sidebar badge.
  // Other producers (getField, listFieldsByPlantation) leave it undefined.
  open_todo_count?: number
}

export async function listFields(orgId: string): Promise<FieldRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('fields_view')
    .select('*')
    .eq('org_id', orgId)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as FieldRow[]
  const counts = await openTaskCountsByFieldIds(rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, open_todo_count: counts[r.id] ?? 0 }))
}

export async function listFieldsByPlantation(plantationId: string): Promise<FieldRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('fields_view')
    .select('*')
    .eq('plantation_id', plantationId)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as FieldRow[]
}

// Fetch a specific set of blocks. Pass orgId to scope explicitly (the "print
// selected blocks" view takes ids from the URL, so it must not honor another
// org's ids even if the view's RLS were ever weakened).
export async function listFieldsByIds(ids: string[], orgId?: string): Promise<FieldRow[]> {
  if (ids.length === 0) return []
  const supabase = await createClient()
  let q = supabase.from('fields_view').select('*').in('id', ids)
  if (orgId) q = q.eq('org_id', orgId)
  const { data, error } = await q.is('archived_at', null).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as FieldRow[]
}

// Pass orgId to enforce ownership explicitly (defense-in-depth on top of the
// view's RLS) — API routes should always scope to the caller's org so tenant
// isolation never hinges on a single database flag.
export async function getField(fieldId: string, orgId?: string): Promise<FieldRow | null> {
  const supabase = await createClient()
  let q = supabase.from('fields_view').select('*').eq('id', fieldId)
  if (orgId) q = q.eq('org_id', orgId)
  const { data, error } = await q.maybeSingle()
  if (error) throw error
  return (data ?? null) as FieldRow | null
}

export async function createField(input: {
  orgId: string
  name: string
  geometry: GeoJSON.Polygon
}): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_field', {
    p_org_id: input.orgId,
    p_name: input.name,
    p_geojson: input.geometry as unknown as Record<string, unknown>,
  })
  if (error) throw error
  // RPC returns the inserted fields row.
  const row = Array.isArray(data) ? data[0] : data
  return { id: row.id as string }
}

export async function updateFieldGeometry(input: {
  fieldId: string
  geometry: GeoJSON.Polygon
}): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_field_geometry', {
    p_field_id: input.fieldId,
    p_geojson: input.geometry as unknown as Record<string, unknown>,
  })
  if (error) throw error
}

export async function updateFieldMetadata(
  fieldId: string,
  patch: {
    name?: string
    variety?: string | null
    plant_date?: string | null
    current_ratoon?: RatoonStage | null
    notes?: string | null
    plantation_id?: string | null
  },
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('fields').update(patch).eq('id', fieldId)
  if (error) throw error
}

// Bulk-assign one plantation (or null to unassign) to many fields in a single
// statement. RLS still enforces the org boundary so callers can't reach into
// another org's fields. Returns the number of rows updated.
export async function bulkAssignPlantation(input: {
  orgId: string
  fieldIds: string[]
  plantationId: string | null
}): Promise<number> {
  if (input.fieldIds.length === 0) return 0
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('fields')
    .update({ plantation_id: input.plantationId })
    .eq('org_id', input.orgId)
    .in('id', input.fieldIds)
    .select('id')
  if (error) throw error
  return data?.length ?? 0
}

export async function archiveField(fieldId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('fields')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', fieldId)
  if (error) throw error
}
