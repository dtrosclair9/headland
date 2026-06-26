import { buildShapefile, type ShpField } from '@/lib/shapefile'
import type { FieldRow } from '@/lib/fields'
import type { Organization, Plantation } from '@/lib/types'

// NAD83 (EPSG:4269) — the datum USDA FSA uses.
export const NAD83_PRJ =
  'GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]'

const FIELDS: ShpField[] = [
  { name: 'name', type: 'C', length: 50 },
  { name: 'acres', type: 'N', length: 13, decimals: 3 },
  { name: 'arpents', type: 'N', length: 13, decimals: 3 },
  { name: 'variety', type: 'C', length: 20 },
  { name: 'plant_dt', type: 'C', length: 10 },
  { name: 'cut', type: 'C', length: 20 },
  { name: 'plantation', type: 'C', length: 50 },
  { name: 'farm', type: 'C', length: 10 },
  { name: 'tract', type: 'C', length: 10 },
  { name: 'notes', type: 'C', length: 100 },
]

function polygonFields(fields: FieldRow[]) {
  return fields.filter(
    (f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  )
}

export function buildFieldsShapefileSet(
  fields: FieldRow[],
  plantations: Plantation[],
  org: Pick<Organization, 'fsa_farm_number'>,
) {
  const tractByName = new Map(plantations.map((s) => [s.name, s.fsa_tract_number ?? '']))
  const farmByName = new Map(
    plantations.map((s) => [s.name, s.fsa_farm_number ?? org.fsa_farm_number ?? '']),
  )
  const features = polygonFields(fields).map((f) => ({
    geometry: f.geometry,
    values: [
      f.name ?? '',
      Number(f.acreage_cached || 0),
      Number(f.arpents_cached || 0),
      f.variety ?? '',
      f.plant_date ?? '',
      f.current_ratoon ? f.current_ratoon.replace(/_/g, ' ') : '',
      f.plantation_name ?? '',
      f.plantation_name
        ? (farmByName.get(f.plantation_name) ?? org.fsa_farm_number ?? '')
        : (org.fsa_farm_number ?? ''),
      f.plantation_name ? (tractByName.get(f.plantation_name) ?? '') : '',
      f.notes ?? '',
    ],
  }))
  const { shp, shx, dbf } = buildShapefile(FIELDS, features)
  return { shp, shx, dbf, prj: NAD83_PRJ, cpg: 'UTF-8' }
}

export function buildFieldsGeoJSON(fields: FieldRow[]): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: polygonFields(fields).map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        name: f.name ?? '',
        acres: Number(f.acreage_cached || 0),
        arpents: Number(f.arpents_cached || 0),
        variety: f.variety ?? '',
        plant_date: f.plant_date ?? '',
        cut: f.current_ratoon ?? '',
        plantation: f.plantation_name ?? '',
        notes: f.notes ?? '',
      },
    })),
  })
}

// --- CSV builders ---------------------------------------------------------

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function csv(headers: string[], rows: (string | number | null)[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}

export type HarvestExportRow = { block: string; harvest_year: number; tons_total: number | null; tons_per_acre: number | null; notes: string | null }
export type SprayExportRow = { block: string; applied_at: string; product: string; type: string; rate: number | null; unit: string | null; wind_dir: string | null; wind_speed: number | null; notes: string | null }
export type ScoutingExportRow = { block: string; category: string; note: string | null; created_at: string }

export function harvestsCsv(rows: HarvestExportRow[]): string {
  return csv(
    ['block', 'harvest_year', 'tons_total', 'tons_per_acre', 'notes'],
    rows.map((r) => [r.block, r.harvest_year, r.tons_total, r.tons_per_acre, r.notes]),
  )
}
export function spraysCsv(rows: SprayExportRow[]): string {
  return csv(
    ['block', 'applied_at', 'product', 'type', 'rate', 'unit', 'wind_dir', 'wind_speed', 'notes'],
    rows.map((r) => [r.block, r.applied_at, r.product, r.type, r.rate, r.unit, r.wind_dir, r.wind_speed, r.notes]),
  )
}
export function scoutingCsv(rows: ScoutingExportRow[]): string {
  return csv(
    ['block', 'category', 'note', 'created_at'],
    rows.map((r) => [r.block, r.category, r.note, r.created_at]),
  )
}
