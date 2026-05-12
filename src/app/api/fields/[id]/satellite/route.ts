import { NextResponse, type NextRequest } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { getField } from '@/lib/fields'
import { fetchLatestRgbImage, isSentinelHubConfigured } from '@/lib/sentinel-hub'

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
    // Sentinel-2 is 10m/px native. Requesting 800×600 over-upscales small
    // fields into a blocky mess; 1200×900 lets browsers downsample smoothly
    // for the typical card width while keeping bigger fields sharper.
    const { pngBuffer } = await fetchLatestRgbImage({
      geometry: field.geometry,
      width: 1200,
      height: 900,
    })

    // A fully-transparent PNG (no cloud-free capture in window) compresses to
    // ~1-3 KB. Detect that and surface a useful 204 instead of a blank img.
    if (pngBuffer.byteLength < 4_000) {
      return NextResponse.json(
        {
          error: 'no_recent_capture',
          message:
            'No cloud-free Sentinel-2 capture for this field in the last 30 days. Try again after the next clear-sky pass.',
        },
        { status: 204 },
      )
    }

    return new NextResponse(new Uint8Array(pngBuffer), {
      headers: {
        'Content-Type': 'image/png',
        // Cache 6 hours — Sentinel-2 captures every 5 days, no point re-asking
        // for the same mosaic on every refresh.
        'Cache-Control': 'private, max-age=21600',
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'satellite_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
}
