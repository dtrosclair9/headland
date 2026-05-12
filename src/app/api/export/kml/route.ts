import { NextResponse } from 'next/server'
// @ts-expect-error tokml ships untyped
import tokml from 'tokml'
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
        name: f.name,
        description: [
          f.variety && `Variety: ${f.variety}`,
          f.current_ratoon && `Cut: ${f.current_ratoon.replace(/_/g, ' ')}`,
          f.plant_date && `Planted: ${f.plant_date}`,
          `Acreage: ${Number(f.acreage_cached || 0).toFixed(2)} ac`,
          f.notes,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    })),
  }

  const kml = tokml(featureCollection, {
    documentName: `${org.name} — Fields`,
    documentDescription: `Field boundaries exported from Headland on ${new Date().toLocaleDateString()}.`,
    name: 'name',
    description: 'description',
  })

  const safeOrg = org.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  return new NextResponse(kml, {
    headers: {
      'Content-Type': 'application/vnd.google-earth.kml+xml',
      'Content-Disposition': `attachment; filename="${safeOrg}-fields.kml"`,
    },
  })
}
