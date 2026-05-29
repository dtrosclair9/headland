import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createField, listFields } from '@/lib/fields'

export async function GET() {
  const { org } = await requireUserAndOrg()
  const fields = await listFields(org.id)
  return NextResponse.json({ fields })
}

const PolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]).rest(z.number()))),
})

const CreateFieldSchema = z.object({
  name: z.string().min(1).max(100).default('Untitled field'),
  geometry: PolygonSchema,
})

export async function POST(request: NextRequest) {
  const { org } = await requireUserAndOrg()

  const body = await request.json().catch(() => null)
  const parsed = CreateFieldSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })
  }

  // No block cap — the product wedge is "draw every block, never lose them",
  // so we never gate on count. Access is governed by trial/subscription
  // (see lib/billing), enforced at the app boundary, not here.

  try {
    const { id } = await createField({
      orgId: org.id,
      name: parsed.data.name,
      geometry: parsed.data.geometry as GeoJSON.Polygon,
    })
    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: 'create_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
