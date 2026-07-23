import { NextResponse, type NextRequest } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { extractImportSource, parseImportSource } from '@/lib/shapefile-import'
import { rateLimit } from '@/lib/rate-limit'
import { MAX_IMPORT_BYTES, MAX_IMPORT_FEATURES, totalBytes } from '@/lib/import-limits'

// Parsing a 20k-feature upload can run past the platform default.
export const maxDuration = 300

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
  const { org } = await requireUserAndOrg()
  if (!(await rateLimit(`import:${org.id}`, 20, 60))) {
    return NextResponse.json({ error: 'Too many uploads — wait a minute and try again.' }, { status: 429 })
  }

  const files = await filesFromForm(request)
  if (files.length === 0) {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })
  }
  if (totalBytes(files) > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: 'That file is too large to import.' }, { status: 413 })
  }

  let parsed
  try {
    parsed = await parseImportSource(extractImportSource(files))
  } catch (e) {
    console.error('[import/parse] parse failed', e)
    return NextResponse.json(
      { error: 'We could not read that file. Upload a zipped shapefile or a .geojson file, then try again.' },
      { status: 400 },
    )
  }

  if (parsed.count === 0) {
    return NextResponse.json(
      { error: 'No field boundaries (polygons) were found in that file.' },
      { status: 400 },
    )
  }
  if (parsed.count > MAX_IMPORT_FEATURES) {
    return NextResponse.json(
      { error: `That file has ${parsed.count} shapes — more than we import at once (${MAX_IMPORT_FEATURES}).` },
      { status: 413 },
    )
  }
  if (parsed.projected) {
    return NextResponse.json(
      {
        error:
          "This file uses a projected coordinate system we couldn't read (its .prj may be missing or non-standard). Include the .prj file, or re-export in latitude/longitude (WGS84 / geographic), and try again.",
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
