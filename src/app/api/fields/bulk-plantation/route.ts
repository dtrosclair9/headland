import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { bulkAssignPlantation } from '@/lib/fields'
import { getPlantation } from '@/lib/plantations'

const BodySchema = z.object({
  field_ids: z.array(z.string().uuid()).min(1).max(10000),
  // null = unassign all selected fields from any plantation.
  plantation_id: z.string().uuid().nullable(),
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

  // If a plantation was supplied, defense-in-depth check that it belongs to this
  // org. RLS would block the update anyway, but a clean 404 is friendlier.
  if (parsed.data.plantation_id) {
    const plantation = await getPlantation(parsed.data.plantation_id)
    if (!plantation || plantation.org_id !== org.id) {
      return NextResponse.json({ error: 'plantation_not_found' }, { status: 404 })
    }
  }

  try {
    const updated = await bulkAssignPlantation({
      orgId: org.id,
      fieldIds: parsed.data.field_ids,
      plantationId: parsed.data.plantation_id,
    })
    return NextResponse.json({ updated })
  } catch (err) {
    return NextResponse.json(
      { error: 'update_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
