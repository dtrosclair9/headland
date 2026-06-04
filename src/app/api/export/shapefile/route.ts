import { NextResponse } from 'next/server'
// @ts-expect-error - jszip 2.x ships no types
import JSZip from 'jszip'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'
import { listSections } from '@/lib/sections'
import { buildShapefile, type ShpField } from '@/lib/shapefile'

// NAD83 (EPSG:4269) — the datum USDA FSA uses. Coordinates are lat/lng degrees.
const NAD83_PRJ =
  'GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]'

// DBF column schema (names capped at 10 chars). Order matters: feature values
// below are aligned to this list positionally.
const FIELDS: ShpField[] = [
  { name: 'name', type: 'C', length: 50 },
  { name: 'acres', type: 'N', length: 13, decimals: 3 },
  { name: 'arpents', type: 'N', length: 13, decimals: 3 },
  { name: 'variety', type: 'C', length: 20 },
  { name: 'plant_dt', type: 'C', length: 10 },
  { name: 'cut', type: 'C', length: 20 },
  { name: 'section', type: 'C', length: 50 },
  { name: 'farm', type: 'C', length: 10 },
  { name: 'tract', type: 'C', length: 10 },
  { name: 'notes', type: 'C', length: 100 },
]

export async function GET() {
  const { org } = await requireUserAndOrg()
  const [fields, sections] = await Promise.all([
    listFields(org.id),
    listSections(org.id),
  ])
  const tractByName = new Map(sections.map((s) => [s.name, s.fsa_tract_number ?? '']))
  // Farm number lives on the section (each section ≈ one FSA farm); fall back
  // to the org-level farm number when the section doesn't have its own.
  const farmByName = new Map(
    sections.map((s) => [s.name, s.fsa_farm_number ?? org.fsa_farm_number ?? '']),
  )

  const features = fields
    .filter((f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    .map((f) => ({
      geometry: f.geometry,
      values: [
        f.name ?? '',
        Number(f.acreage_cached || 0),
        Number(f.arpents_cached || 0),
        f.variety ?? '',
        f.plant_date ?? '',
        f.current_ratoon ? f.current_ratoon.replace(/_/g, ' ') : '',
        f.section_name ?? '',
        f.section_name
          ? (farmByName.get(f.section_name) ?? org.fsa_farm_number ?? '')
          : (org.fsa_farm_number ?? ''),
        f.section_name ? (tractByName.get(f.section_name) ?? '') : '',
        f.notes ?? '',
      ],
    }))

  const { shp, shx, dbf } = buildShapefile(FIELDS, features)

  const zip = new JSZip()
  zip.file('fields/fields.shp', shp)
  zip.file('fields/fields.shx', shx)
  zip.file('fields/fields.dbf', dbf)
  zip.file('fields/fields.prj', NAD83_PRJ)
  zip.file('fields/fields.cpg', 'UTF-8')
  const buffer = zip.generate({ type: 'nodebuffer', compression: 'STORE' }) as Buffer

  const safeOrg = org.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeOrg}-fields-shapefile.zip"`,
    },
  })
}
