import { createClient } from '@/lib/supabase/server'
import type { Field, RatoonStage } from '@/lib/types'

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
export interface FieldRow extends Omit<Field, 'geometry'> {
  geometry: GeoJSON.Polygon
  centroid_lng: number
  centroid_lat: number
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
  return (data ?? []) as FieldRow[]
}

export async function getField(fieldId: string): Promise<FieldRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('fields_view')
    .select('*')
    .eq('id', fieldId)
    .maybeSingle()
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
  },
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('fields').update(patch).eq('id', fieldId)
  if (error) throw error
}

export async function archiveField(fieldId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('fields')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', fieldId)
  if (error) throw error
}
