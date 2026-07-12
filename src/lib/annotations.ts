import { createClient } from '@/lib/supabase/server'

// A hand-drawn map annotation: a reference line (road, ditch) or a text label
// ("Hwy 308", "Shop house"). Farm-wide; rendered on the live map and prints.
export interface AnnotationRow {
  id: string
  kind: 'line' | 'text'
  geometry: GeoJSON.LineString | GeoJSON.Point
  text: string | null
  color: string
  /** text-label font size (screen px at mid zoom) */
  size: number
  /** text-label rotation in degrees */
  rotation: number
  /** line stroke width (screen px / print canvas units); null = default */
  width: number | null
}

export async function listAnnotations(orgId: string): Promise<AnnotationRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('map_annotations')
    .select('id, kind, geometry, text, color, size, rotation, width')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as AnnotationRow[]
}
