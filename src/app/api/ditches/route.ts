import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createDitch, listDitches } from '@/lib/ditches'

export async function GET() {
  const { org } = await requireUserAndOrg()
  const ditches = await listDitches(org.id)
  return NextResponse.json({ ditches })
}

const LineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(z.tuple([z.number(), z.number()]).rest(z.number())).min(2),
})

const CreateSchema = z.object({
  geometry: LineStringSchema,
  notes: z.string().max(500).optional().nullable(),
})

export async function POST(request: NextRequest) {
  const { org } = await requireUserAndOrg()
  const body = await request.json().catch(() => null)
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  try {
    const { id } = await createDitch({
      orgId: org.id,
      geometry: parsed.data.geometry as GeoJSON.LineString,
      notes: parsed.data.notes ?? null,
    })
    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: 'create_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
