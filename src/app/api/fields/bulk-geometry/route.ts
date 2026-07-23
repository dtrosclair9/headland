import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'
import { chunkIds } from '@/lib/chunk-ids'

const PolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]).rest(z.number()))),
})

const Body = z.object({
  features: z
    .array(z.object({ id: z.string().uuid(), geometry: PolygonSchema }))
    .min(1)
    .max(10000),
})

// Save new geometries for a repositioned (moved/rotated) group of blocks.
export async function POST(request: NextRequest) {
  const { org } = await requireUserAndOrg()

  const body = await request.json().catch(() => null)
  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const supabase = await createClient()

  // Defense-in-depth on top of RLS: only update blocks that belong to this org.
  // Chunk the id filter — a big batch overflows the request-URL header limit.
  const ids = parsed.data.features.map((f) => f.id)
  const ownedSet = new Set<string>()
  for (const slice of chunkIds(ids)) {
    const { data: owned, error: ownErr } = await supabase
      .from('fields')
      .select('id')
      .eq('org_id', org.id)
      .in('id', slice)
    if (ownErr) {
      console.error('[bulk-geometry] ownership check failed', ownErr)
      return NextResponse.json({ error: 'save_failed' }, { status: 500 })
    }
    for (const r of owned ?? []) ownedSet.add(r.id as string)
  }
  const features = parsed.data.features.filter((f) => ownedSet.has(f.id))
  if (features.length === 0) {
    return NextResponse.json({ error: 'no_owned_fields' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('bulk_update_field_geometries', {
    p_features: features,
  })
  if (error) {
    console.error('[bulk-geometry] rpc failed', error)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }

  return NextResponse.json({ updated: typeof data === 'number' ? data : features.length })
}
