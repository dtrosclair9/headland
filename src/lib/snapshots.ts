import { createAdminClient } from '@/lib/supabase/admin'
// @ts-expect-error - jszip 2.x ships no types
import JSZip from 'jszip'
import {
  buildFieldsShapefileSet,
  buildFieldsGeoJSON,
  harvestsCsv,
  spraysCsv,
  scoutingCsv,
} from '@/lib/farm-export'

const BUCKET = 'farm-snapshots'

export type FarmSnapshotRow = {
  id: string
  org_id: string
  period: string
  trigger: 'auto' | 'manual'
  storage_path: string
  file_size: number | null
  block_count: number
  acreage: number
  harvest_count: number
  spray_count: number
  created_at: string
}

function monthStart(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export async function generateFarmSnapshot(
  orgId: string,
  trigger: 'auto' | 'manual',
): Promise<{ id: string; skipped?: boolean }> {
  const admin = createAdminClient()
  const period = monthStart()

  if (trigger === 'auto') {
    const { data: existing } = await admin
      .from('farm_snapshots')
      .select('id')
      .eq('org_id', orgId)
      .eq('period', period)
      .eq('trigger', 'auto')
      .maybeSingle()
    if (existing) return { id: existing.id, skipped: true }
  }

  // Load org metadata, fields, plantations, and records via admin (bypasses RLS).
  const { data: org } = await admin
    .from('organizations')
    .select('name, fsa_farm_number')
    .eq('id', orgId)
    .single()

  const { data: fields } = await admin
    .from('fields_view')
    .select('*')
    .eq('org_id', orgId)
    .is('archived_at', null)

  const { data: plantations } = await admin
    .from('plantations')
    .select('name, fsa_farm_number, fsa_tract_number')
    .eq('org_id', orgId)

  const fieldNameById = new Map((fields ?? []).map((f) => [f.id as string, (f.name as string) ?? '']))
  const ids = (fields ?? []).map((f) => f.id as string)

  const { data: harvests } = ids.length
    ? await admin
        .from('harvests')
        .select('field_id, harvest_year, tons_total, tons_per_acre, notes')
        .in('field_id', ids)
    : { data: [] as any[] }

  // Select the real DB column names: wind_direction + wind_speed_mph.
  // Map to SprayExportRow's wind_dir / wind_speed keys below.
  const { data: sprays } = ids.length
    ? await admin
        .from('applications')
        .select('field_id, applied_at, product, type, rate, unit, wind_direction, wind_speed_mph, notes')
        .in('field_id', ids)
    : { data: [] as any[] }

  const { data: scouting } = ids.length
    ? await admin
        .from('scouting_pins')
        .select('field_id, category, note, created_at')
        .in('field_id', ids)
    : { data: [] as any[] }

  // Build the zip archive.
  const { shp, shx, dbf, prj, cpg } = buildFieldsShapefileSet(
    (fields ?? []) as any,
    (plantations ?? []) as any,
    (org ?? { fsa_farm_number: null }) as any,
  )
  const zip = new JSZip()
  zip.file('blocks/blocks.shp', shp)
  zip.file('blocks/blocks.shx', shx)
  zip.file('blocks/blocks.dbf', dbf)
  zip.file('blocks/blocks.prj', prj)
  zip.file('blocks/blocks.cpg', cpg)
  zip.file('blocks.geojson', buildFieldsGeoJSON((fields ?? []) as any))
  zip.file(
    'harvests.csv',
    harvestsCsv(
      (harvests ?? []).map((h: any) => ({
        block: fieldNameById.get(h.field_id) ?? '',
        harvest_year: h.harvest_year,
        tons_total: h.tons_total,
        tons_per_acre: h.tons_per_acre,
        notes: h.notes,
      })),
    ),
  )
  zip.file(
    'sprays.csv',
    spraysCsv(
      (sprays ?? []).map((s: any) => ({
        block: fieldNameById.get(s.field_id) ?? '',
        applied_at: s.applied_at,
        product: s.product,
        type: s.type,
        rate: s.rate,
        unit: s.unit,
        // DB columns are wind_direction / wind_speed_mph; export type uses wind_dir / wind_speed
        wind_dir: s.wind_direction,
        wind_speed: s.wind_speed_mph,
        notes: s.notes,
      })),
    ),
  )
  zip.file(
    'scouting.csv',
    scoutingCsv(
      (scouting ?? []).map((p: any) => ({
        block: fieldNameById.get(p.field_id) ?? '',
        category: p.category,
        note: p.note,
        created_at: p.created_at,
      })),
    ),
  )

  const acreage = (fields ?? []).reduce((s, f) => s + Number((f as any).acreage_cached || 0), 0)
  zip.file(
    'README.txt',
    `${org?.name ?? 'Farm'} — Headland snapshot ${period}\n` +
      `Blocks: ${(fields ?? []).length}\n` +
      `Acres: ${acreage.toFixed(2)}\n` +
      `Harvest records: ${(harvests ?? []).length}\n` +
      `Spray records: ${(sprays ?? []).length}\n`,
  )

  const buffer: Buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer

  // Upload to Storage.
  const storage_path =
    trigger === 'auto'
      ? `${orgId}/${period.slice(0, 7)}.zip`
      : `${orgId}/${period.slice(0, 7)}-manual-${Date.now()}.zip`

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storage_path, buffer, { contentType: 'application/zip', upsert: true })
  if (upErr) throw new Error(`snapshot upload failed: ${upErr.message}`)

  // Insert the metadata row.
  const { data: row, error: insErr } = await admin
    .from('farm_snapshots')
    .insert({
      org_id: orgId,
      period,
      trigger,
      storage_path,
      file_size: buffer.length,
      block_count: (fields ?? []).length,
      acreage: Math.round(acreage * 100) / 100,
      harvest_count: (harvests ?? []).length,
      spray_count: (sprays ?? []).length,
    })
    .select('id')
    .single()
  if (insErr) throw new Error(`snapshot insert failed: ${insErr.message}`)
  return { id: row.id }
}

export async function listSnapshots(orgId: string): Promise<FarmSnapshotRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('farm_snapshots')
    .select('*')
    .eq('org_id', orgId)
    .order('period', { ascending: false })
    .order('created_at', { ascending: false })
  return (data ?? []) as FarmSnapshotRow[]
}

export async function getSnapshot(id: string): Promise<FarmSnapshotRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('farm_snapshots')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return (data as FarmSnapshotRow) ?? null
}
