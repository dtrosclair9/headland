import { NextResponse, type NextRequest } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { extractShapefileComponents, parseShapefileBuffers } from '@/lib/shapefile-import'

export const runtime = 'nodejs'

async function filesFromForm(request: NextRequest) {
  const form = await request.formData()
  const raw = form.getAll('files').filter((x): x is File => x instanceof File)
  return Promise.all(
    raw.map(async (f) => ({ name: f.name, data: Buffer.from(await f.arrayBuffer()) })),
  )
}

// Step 1 of import: read the uploaded shapefile and return a column summary for
// the mapping UI. Does NOT touch the database.
export async function POST(request: NextRequest) {
  await requireUserAndOrg()

  const files = await filesFromForm(request)
  if (files.length === 0) {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })
  }

  let parsed
  try {
    parsed = await parseShapefileBuffers(extractShapefileComponents(files))
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not read that file.' },
      { status: 400 },
    )
  }

  if (parsed.count === 0) {
    return NextResponse.json(
      { error: 'No field boundaries (polygons) were found in that file.' },
      { status: 400 },
    )
  }
  if (parsed.projected) {
    return NextResponse.json(
      {
        error:
          'This file uses a projected coordinate system. Re-export it in latitude/longitude (WGS84 / geographic) and try again.',
      },
      { status: 400 },
    )
  }

  return NextResponse.json({
    count: parsed.count,
    columns: parsed.columns,
    samples: parsed.samples,
    distinct: parsed.distinct,
  })
}
