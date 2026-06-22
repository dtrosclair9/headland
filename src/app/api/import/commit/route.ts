import { NextResponse, type NextRequest } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'
import { extractShapefileComponents, parseShapefileBuffers } from '@/lib/shapefile-import'

export const runtime = 'nodejs'

const RATOON = new Set([
  'plant_cane',
  'first_stubble',
  'second_stubble',
  'third_stubble',
  'fourth_stubble',
  'fifth_stubble_plus',
  'sixth_stubble_plus',
  'fallow',
])

interface Mapping {
  nameColumn?: string | null
  varietyColumn?: string | null
  plantationColumn?: string | null
  cutColumn?: string | null
  // Column holding the grower's stated acreage (e.g. FarmWorks "FSA acres").
  // When set, the importer trusts this over the polygon-derived area — source
  // polygons are often rough/oversized while the stated acres are correct.
  acresColumn?: string | null
  // Maps a raw cut value (e.g. "4") to a ratoon_stage (e.g. "fourth_stubble").
  cutValueMap?: Record<string, string>
}

// Step 2 of import: re-parse the file, apply the column mapping, and bulk-create
// the fields (auto-creating plantations). Re-parsing avoids holding ~500 polygons
// in client state between steps.
export async function POST(request: NextRequest) {
  const { org } = await requireUserAndOrg()

  const form = await request.formData()
  let mapping: Mapping = {}
  const mappingRaw = form.get('mapping')
  try {
    mapping = JSON.parse(typeof mappingRaw === 'string' ? mappingRaw : '{}') as Mapping
  } catch {
    mapping = {}
  }

  const rawFiles = form.getAll('files').filter((x): x is File => x instanceof File)
  const files = await Promise.all(
    rawFiles.map(async (f) => ({ name: f.name, data: Buffer.from(await f.arrayBuffer()) })),
  )

  let parsed
  try {
    parsed = await parseShapefileBuffers(extractShapefileComponents(files))
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not read that file.' },
      { status: 400 },
    )
  }
  if (parsed.count === 0 || parsed.projected) {
    return NextResponse.json({ error: 'That file could not be imported.' }, { status: 400 })
  }

  const cutMap = mapping.cutValueMap ?? {}
  const val = (props: Record<string, string>, col?: string | null) =>
    col ? (props[col] ?? '') : ''

  const features = parsed.features.map((f) => {
    const cutRaw = mapping.cutColumn ? (f.properties[mapping.cutColumn] ?? '') : ''
    const ratoon = cutMap[cutRaw]
    // Parse the stated acreage if an acres column was mapped; the RPC trusts it
    // over the polygon area when present (and > 0).
    const acresRaw = mapping.acresColumn ? (f.properties[mapping.acresColumn] ?? '') : ''
    const acresNum = parseFloat(String(acresRaw).replace(/[^0-9.]/g, ''))
    return {
      name: val(f.properties, mapping.nameColumn),
      geometry: f.geometry,
      variety: val(f.properties, mapping.varietyColumn),
      ratoon: ratoon && RATOON.has(ratoon) ? ratoon : '',
      plantation: val(f.properties, mapping.plantationColumn),
      acres: Number.isFinite(acresNum) && acresNum > 0 ? String(acresNum) : '',
    }
  })

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('bulk_import_fields', {
    p_org_id: org.id,
    p_features: features,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ imported: typeof data === 'number' ? data : features.length })
}
