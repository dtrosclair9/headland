import { createAdminClient } from '@/lib/supabase/admin'
// @ts-expect-error - jszip 2.x ships no types
import JSZip from 'jszip'
import type { FieldRow } from '@/lib/fields'
import type { RatoonStage } from '@/lib/types'

const BUCKET = 'farm-snapshots'

const RATOON = new Set([
  'plant_cane',
  'first_stubble',
  'second_stubble',
  'third_stubble',
  'fourth_stubble',
  'fifth_stubble_plus',
  'sixth_stubble_plus',
  'fallow',
])

// Rebuild printable blocks from a snapshot's stored blocks.geojson — the farm
// exactly as it stood when the snapshot was taken (geometry, cut, variety,
// acres). This is what makes every snapshot a viewable crop map, not just a
// zip of data files, and it works for snapshots taken before this feature
// existed (the geojson has always been in the archive).
export async function loadSnapshotBlocks(storagePath: string): Promise<FieldRow[] | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(BUCKET).download(storagePath)
  if (error || !data) return null

  let geojson: GeoJSON.FeatureCollection
  try {
    const zip = new JSZip(Buffer.from(await data.arrayBuffer()))
    const entry = zip.file('blocks.geojson')
    if (!entry) return null
    geojson = JSON.parse(entry.asText()) as GeoJSON.FeatureCollection
  } catch {
    return null
  }

  return (geojson.features ?? [])
    .filter((f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon')
    .map((f, i) => {
      const p = (f.properties ?? {}) as Record<string, unknown>
      const cut = String(p.cut ?? '')
      const plantation = String(p.plantation ?? '') || null
      return {
        // Synthetic ids — these blocks exist only in the archive. The
        // plantation NAME doubles as the grouping id so one page prints per
        // plantation, same as a live print.
        id: `snap-${i}`,
        org_id: '',
        name: String(p.name ?? ''),
        geometry: f.geometry as GeoJSON.Polygon,
        centroid_lng: 0,
        centroid_lat: 0,
        acreage_cached: Number(p.acres ?? 0),
        arpents_cached: Number(p.arpents ?? 0),
        variety: String(p.variety ?? '') || null,
        plant_date: String(p.plant_date ?? '') || null,
        current_ratoon: (RATOON.has(cut) ? cut : null) as RatoonStage | null,
        notes: String(p.notes ?? '') || null,
        plantation_id: plantation,
        plantation_name: plantation,
        fsa_farm_number: String(p.farm ?? '') || null,
        fsa_tract_number: String(p.tract ?? '') || null,
        clu_number: String(p.clu ?? '') || null,
        clu_id: String(p.clu_id ?? '') || null,
        archived_at: null,
        created_at: '',
      } as FieldRow
    })
}
