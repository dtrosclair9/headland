import { NextResponse } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'

export async function GET() {
  const { org } = await requireUserAndOrg()
  const fields = await listFields(org.id)

  const featureCollection: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: fields.map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        id: f.id,
        name: f.name,
        acreage: Number(f.acreage_cached || 0),
        arpents: Number(f.arpents_cached || 0),
        variety: f.variety,
        plant_date: f.plant_date,
        current_ratoon: f.current_ratoon,
        notes: f.notes,
      },
    })),
  }

  const safeOrg = org.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  return new NextResponse(JSON.stringify(featureCollection, null, 2), {
    headers: {
      'Content-Type': 'application/geo+json',
      'Content-Disposition': `attachment; filename="${safeOrg}-fields.geojson"`,
    },
  })
}
