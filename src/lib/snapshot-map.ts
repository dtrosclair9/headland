import { createAdminClient } from '@/lib/supabase/admin'
// @ts-expect-error - jszip 2.x ships no types
import JSZip from 'jszip'
import type { FieldRow } from '@/lib/fields'
import type { RatoonStage } from '@/lib/types'

const BUCKET = 'farm-snapshots'

// Split one print group into geographically-contiguous clusters. The
// "Unassigned" bucket (and any non-contiguous plantation) can span areas
// miles apart — fitting them all on ONE sheet zooms out until every block is
// confetti and no label fits. Blocks chain into the same cluster when their
// centroids are within gapMeters (transitively), so each printed page frames
// one real place. A contiguous plantation comes back as a single cluster.
export function clusterByProximity<T extends { geometry: GeoJSON.Polygon }>(
  blocks: T[],
  gapMeters = 1000,
): T[][] {
  if (blocks.length <= 1) return blocks.length ? [blocks] : []
  const cents = blocks.map((b) => {
    let x = 0,
      y = 0,
      n = 0
    for (const ring of b.geometry?.coordinates ?? []) {
      for (const c of ring) {
        x += c[0]
        y += c[1]
        n++
      }
    }
    return n ? [x / n, y / n] : [0, 0]
  })
  const mLng = 111320 * Math.cos(((cents[0][1] || 30) * Math.PI) / 180)
  const mLat = 110540
  // Union-find over centroid proximity.
  const parent = blocks.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const dx = (cents[i][0] - cents[j][0]) * mLng
      const dy = (cents[i][1] - cents[j][1]) * mLat
      if (dx * dx + dy * dy <= gapMeters * gapMeters) parent[find(i)] = find(j)
    }
  }
  const byRoot = new Map<number, T[]>()
  for (let i = 0; i < blocks.length; i++) {
    const r = find(i)
    const arr = byRoot.get(r) ?? []
    arr.push(blocks[i])
    byRoot.set(r, arr)
  }
  // Biggest area first — the main farm leads, outliers follow.
  return Array.from(byRoot.values()).sort((a, b) => b.length - a.length)
}

// Give archived blocks their plantation names by matching each one to the
// nearest CURRENT block (centroid within maxMeters). Old snapshots stored no
// plantation on the geojson (and a block's plantation is organizational, not
// historical fact), so page titles inherit today's assignments — "Woodlawn",
// not "Unassigned — area 3". Blocks that already carry a plantation keep it;
// unmatched blocks stay unassigned and fall back to geographic clustering.
export function inheritPlantations(
  snapBlocks: FieldRow[],
  liveFields: Pick<FieldRow, 'centroid_lng' | 'centroid_lat' | 'plantation_id' | 'plantation_name'>[],
  maxMeters = 150,
): FieldRow[] {
  const live = liveFields.filter((f) => f.plantation_id && f.plantation_name)
  if (live.length === 0) return snapBlocks
  const mLng = 111320 * Math.cos(((live[0].centroid_lat || 30) * Math.PI) / 180)
  const mLat = 110540
  const maxSq = maxMeters * maxMeters
  return snapBlocks.map((b) => {
    if (b.plantation_name) return b
    let cx = 0,
      cy = 0,
      n = 0
    for (const ring of b.geometry?.coordinates ?? []) {
      for (const c of ring) {
        cx += c[0]
        cy += c[1]
        n++
      }
    }
    if (!n) return b
    cx /= n
    cy /= n
    let best: (typeof live)[number] | null = null
    let bestSq = maxSq
    for (const f of live) {
      const dx = (cx - f.centroid_lng) * mLng
      const dy = (cy - f.centroid_lat) * mLat
      const d = dx * dx + dy * dy
      if (d <= bestSq) {
        bestSq = d
        best = f
      }
    }
    return best
      ? { ...b, plantation_id: best.plantation_id, plantation_name: best.plantation_name }
      : b
  })
}

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
      // Real centroid — the map flies here when the block is selected, so
      // (0,0) placeholders would launch the camera into the Atlantic.
      let cx = 0,
        cy = 0,
        cn = 0
      for (const ring of (f.geometry as GeoJSON.Polygon).coordinates ?? []) {
        for (const c of ring) {
          cx += c[0]
          cy += c[1]
          cn++
        }
      }
      return {
        // Synthetic ids — these blocks exist only in the archive. The
        // plantation NAME doubles as the grouping id so one page prints per
        // plantation, same as a live print.
        id: `snap-${i}`,
        org_id: '',
        name: String(p.name ?? ''),
        geometry: f.geometry as GeoJSON.Polygon,
        centroid_lng: cn ? cx / cn : 0,
        centroid_lat: cn ? cy / cn : 0,
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
