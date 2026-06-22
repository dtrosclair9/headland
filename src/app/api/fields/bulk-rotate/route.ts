import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { rotateBlocks } from '@/lib/rotation'
import { getPlantation } from '@/lib/plantations'

const BodySchema = z
  .object({
    field_ids: z.array(z.string().uuid()).max(2000).optional(),
    plantation_id: z.string().uuid().optional(),
    crop_year: z.number().int().min(1980).max(2100).optional(),
  })
  .refine((b) => (b.field_ids && b.field_ids.length > 0) || b.plantation_id, {
    message: 'Provide field_ids or plantation_id',
  })

export async function POST(request: NextRequest) {
  const { org } = await requireUserAndOrg()
  const body = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  // If a plantation was supplied, confirm it belongs to this org.
  if (parsed.data.plantation_id) {
    const plantation = await getPlantation(parsed.data.plantation_id)
    if (!plantation || plantation.org_id !== org.id) {
      return NextResponse.json({ error: 'plantation_not_found' }, { status: 404 })
    }
  }

  try {
    const result = await rotateBlocks({
      orgId: org.id,
      fieldIds: parsed.data.field_ids,
      plantationId: parsed.data.plantation_id,
      cropYear: parsed.data.crop_year,
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: 'rotate_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
