import { NextResponse } from 'next/server'
import { toKML } from '@placemarkio/tokml'
import { requireUserAndOrg } from '@/lib/orgs'
import { rateLimit } from '@/lib/rate-limit'
import { listFields } from '@/lib/fields'

export async function GET() {
  const { org } = await requireUserAndOrg()
  // Full-farm re-encode per call — cheap CPU-amplification lever without a cap.
  if (!(await rateLimit(`export:${org.id}`, 10, 60))) {
    return NextResponse.json({ error: 'Too many exports — wait a minute and try again.' }, { status: 429 })
  }
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

  // @placemarkio/tokml reads each feature's name/description properties
  // automatically but dropped the old document-level options — re-insert the
  // document name/description so Google Earth shows a proper title.
  const esc = (t: string) =>
    t.replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[ch] as string)
  const kml = toKML(featureCollection).replace(
    /<Document>/,
    `<Document><name>${esc(`${org.name} — Fields`)}</name><description>${esc(
      `Field boundaries exported from Headland on ${new Date().toLocaleDateString()}.`,
    )}</description>`,
  )

  const safeOrg = org.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  return new NextResponse(kml, {
    headers: {
      'Content-Type': 'application/vnd.google-earth.kml+xml',
      'Content-Disposition': `attachment; filename="${safeOrg}-fields.kml"`,
    },
  })
}
