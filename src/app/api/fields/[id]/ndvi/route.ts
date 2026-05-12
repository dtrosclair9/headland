import { NextResponse, type NextRequest } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { getField } from '@/lib/fields'
import { fetchNdviImage, isSentinelHubConfigured } from '@/lib/sentinel-hub'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { org } = await requireUserAndOrg()
  const { id } = await params

  if (!isSentinelHubConfigured()) {
    return NextResponse.json(
      { error: 'sentinel_hub_not_configured' },
      { status: 503 },
    )
  }

  const field = await getField(id)
  if (!field) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (field.org_id !== org.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  try {
    const { pngBuffer } = await fetchNdviImage({ geometry: field.geometry })
    return new NextResponse(new Uint8Array(pngBuffer), {
      headers: {
        'Content-Type': 'image/png',
        // Cache 6 hours at the edge — Sentinel-2 captures every 5 days, no need to refetch often.
        'Cache-Control': 'private, max-age=21600',
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'ndvi_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
}
