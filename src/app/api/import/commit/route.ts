import { NextResponse, type NextRequest } from 'next/server'
import { area as turfArea } from '@turf/turf'
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

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 3) return 0
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0,
    dx = 0,
    dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0
}

// Auto-detect the stated-acreage column WITHOUT relying on its name — different
// farm software names it differently ("FSA acres", "My Acres", "Area",
// "Acreage", "ac"…). The reliable, name-agnostic signal: a column of positive
// numbers in a field-acreage range whose values track the polygon sizes (high
// correlation). A matching name only nudges the score. Returns null if nothing
// looks like acreage (then we fall back to the polygon area).
function autoDetectAcresColumn(parsed: {
  columns: string[]
  features: { geometry: GeoJSON.Geometry; properties: Record<string, string> }[]
}): string | null {
  const feats = parsed.features
  if (feats.length < 3) return null
  const areas = feats.map((f) => {
    try {
      return turfArea(f.geometry) * 0.000247105
    } catch {
      return NaN
    }
  })

  let best: string | null = null
  let bestScore = 0
  for (const col of parsed.columns) {
    const vals = feats.map((f) =>
      parseFloat(String(f.properties[col] ?? '').replace(/[^0-9.]/g, '')),
    )
    const valid = vals.filter((v) => Number.isFinite(v) && v > 0)
    if (valid.length < feats.length * 0.6) continue // must be mostly numeric & positive
    const sorted = [...valid].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    if (median < 0.2 || median > 5000) continue // a field's acreage, not an ID

    const xs: number[] = []
    const ys: number[] = []
    for (let i = 0; i < feats.length; i++) {
      if (Number.isFinite(vals[i]) && vals[i] > 0 && Number.isFinite(areas[i])) {
        xs.push(vals[i])
        ys.push(areas[i])
      }
    }
    let score = pearson(xs, ys)
    if (/acre|acreage/i.test(col)) score += 0.25
    if (/area/i.test(col)) score += 0.1
    if (/fsa/i.test(col)) score += 0.1

    if (score > bestScore) {
      bestScore = score
      best = col
    }
  }
  // Require a genuine relationship to the field sizes — avoids grabbing an ID
  // column that happens to be numeric.
  return bestScore >= 0.6 ? best : null
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
    console.error('[import/commit] parse failed', e)
    return NextResponse.json(
      { error: 'We could not read that file. Make sure it is a zipped shapefile or a KML, then try again.' },
      { status: 400 },
    )
  }
  if (parsed.count === 0 || parsed.projected) {
    return NextResponse.json({ error: 'That file could not be imported.' }, { status: 400 })
  }

  const cutMap = mapping.cutValueMap ?? {}
  const val = (props: Record<string, string>, col?: string | null) =>
    col ? (props[col] ?? '') : ''

  // Acreage MUST come from the file whenever it's there — never depend on the
  // grower mapping it. Use their mapped column if set, else auto-detect any
  // "acre(s)" column (preferring FSA acres) whose values look like acreages.
  const acresCol = mapping.acresColumn || autoDetectAcresColumn(parsed)
  const features = parsed.features.map((f) => {
    const cutRaw = mapping.cutColumn ? (f.properties[mapping.cutColumn] ?? '') : ''
    const ratoon = cutMap[cutRaw]
    const acresRaw = acresCol ? (f.properties[acresCol] ?? '') : ''
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
    console.error('[import/commit] bulk_import_fields failed', error)
    return NextResponse.json(
      { error: 'Something went wrong saving your fields. Please try again.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ imported: typeof data === 'number' ? data : features.length })
}
