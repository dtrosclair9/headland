import { NextResponse } from 'next/server'
// @ts-expect-error - shp-write ships no types
import shpwrite from 'shp-write'
// @ts-expect-error - jszip 2.x ships no types
import JSZip from 'jszip'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'
import { listSections } from '@/lib/sections'

// DBF field names cap at 10 chars — map full names to short codes.
const PROP_KEYS = {
  id: 'id',
  name: 'name',
  acreage: 'acreage',
  arpents: 'arpents',
  variety: 'variety',
  plant_date: 'plant_date',
  current_ratoon: 'cur_ratoon',
  section: 'section',
  fsa_tract: 'fsa_tract',
  notes: 'notes',
} as const

// NAD83 (EPSG:4269) WKT — the projection USDA FSA uses for shapefile imports.
// shp-write writes WGS84 (EPSG:4326) by default; we overwrite the .prj after.
// Both are lat/lng degrees, so geometry coordinates need no transformation —
// only the projection metadata changes.
const NAD83_PRJ =
  'GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]'

export async function GET() {
  const { org } = await requireUserAndOrg()
  const [fields, sections] = await Promise.all([
    listFields(org.id),
    listSections(org.id),
  ])
  const tractByName = new Map(sections.map((s) => [s.name, s.fsa_tract_number ?? '']))

  const featureCollection: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: fields.map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        [PROP_KEYS.id]: f.id,
        [PROP_KEYS.name]: f.name ?? '',
        [PROP_KEYS.acreage]: Number(f.acreage_cached || 0),
        [PROP_KEYS.arpents]: Number(f.arpents_cached || 0),
        [PROP_KEYS.variety]: f.variety ?? '',
        [PROP_KEYS.plant_date]: f.plant_date ?? '',
        [PROP_KEYS.current_ratoon]: f.current_ratoon ?? 0,
        [PROP_KEYS.section]: f.section_name ?? '',
        [PROP_KEYS.fsa_tract]: f.section_name ? (tractByName.get(f.section_name) ?? '') : '',
        [PROP_KEYS.notes]: f.notes ?? '',
      },
    })),
  }

  const rawZip = shpwrite.zip(featureCollection, {
    folder: 'fields',
    types: { polygon: 'fields' },
  }) as Buffer

  // Post-process the shp-write zip: replace the WGS84 .prj with NAD83, and add
  // a .cpg file declaring UTF-8 so apostrophes / French place names survive.
  const zip = new JSZip(rawZip)
  zip.file('fields/fields.prj', NAD83_PRJ)
  zip.file('fields/fields.cpg', 'UTF-8')
  const finalBuffer = zip.generate({ type: 'nodebuffer', compression: 'STORE' }) as Buffer

  const safeOrg = org.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  return new NextResponse(new Uint8Array(finalBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeOrg}-fields-shapefile.zip"`,
    },
  })
}
