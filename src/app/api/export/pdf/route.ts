import { createElement } from 'react'
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'
import { listHarvests, listRecentApplications } from '@/lib/records'
import { fetchStaticMapImage } from '@/lib/mapbox-static'
import {
  BulkPrintDocument,
  type BulkFieldData,
} from '@/components/print/BulkPrintDocument'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const { org } = await requireUserAndOrg()
  const fields = await listFields(org.id)

  if (fields.length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 })
  }

  // Fetch per-field data in parallel. Cap concurrency for the static-image
  // calls so we don't get rate-limited at large farms.
  const data: BulkFieldData[] = await Promise.all(
    fields.map(async (field) => {
      const [mapImage, recentHarvests, recentApplications] = await Promise.all([
        fetchStaticMapImage(field.geometry, 700, 420),
        listHarvests(field.id),
        listRecentApplications(field.id, 5),
      ])
      return {
        field,
        mapImage,
        recentHarvests: recentHarvests.slice(0, 5),
        recentApplications,
      }
    }),
  )

  const pdfBuffer = await renderToBuffer(
    createElement(BulkPrintDocument, {
      farmName: org.name,
      units: org.units_default,
      fields: data,
    }),
  )

  const safeOrg = org.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeOrg}-fields.pdf"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
