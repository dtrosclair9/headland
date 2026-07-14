import { createClient } from '@/lib/supabase/server'
import { paginateAll } from '@/lib/paginate'

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
  // Paginate past the 1000-row PostgREST cap — a well-used farm can accumulate
  // more than 1000 drawn lines/labels over time.
  return paginateAll<AnnotationRow>((from, to) =>
    supabase
      .from('map_annotations')
      .select('id, kind, geometry, text, color, size, rotation, width')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
      .range(from, to),
  )
}
