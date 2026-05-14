import { NextResponse } from 'next/server'
// @ts-expect-error - shp-write ships no types
import shpwrite from 'shp-write'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'

// DBF field names cap at 10 chars — map full names to short codes.
const PROP_KEYS = {
  id: 'id',
  name: 'name',
  acreage: 'acreage',
  arpents: 'arpents',
  variety: 'variety',
  plant_date: 'plant_date',
  current_ratoon: 'cur_ratoon',
  notes: 'notes',
} as const

export async function GET() {
  const { org } = await requireUserAndOrg()
  const fields = await listFields(org.id)

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
        [PROP_KEYS.notes]: f.notes ?? '',
      },
    })),
  }

  const zipBuffer = shpwrite.zip(featureCollection, {
    folder: 'fields',
    types: { polygon: 'fields' },
  }) as Buffer

  const safeOrg = org.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeOrg}-fields-shapefile.zip"`,
    },
  })
}
