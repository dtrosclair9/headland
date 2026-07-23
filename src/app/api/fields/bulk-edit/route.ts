import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { rateLimit } from '@/lib/rate-limit'
import { bulkEditFields } from '@/lib/bulk-edit'

// A 10k-id bulk edit extrapolates to ~30s at 50k-acre scale.
export const maxDuration = 300

const RatoonEnum = z.enum([
  'plant_cane',
  'first_stubble',
  'second_stubble',
  'third_stubble',
  'fourth_stubble',
  'fifth_stubble_plus',
  'sixth_stubble_plus',
  'fallow',
])

// Exactly one of the two assignments per call — the UI's "Assign to…" tree
// picks either a variety or a cycle, never both at once.
const Body = z.object({
  field_ids: z.array(z.string().uuid()).min(1).max(10000),
  set: z.union([
    z.object({ variety: z.string().trim().min(1).max(50).nullable() }).strict(),
    z.object({ cycle: RatoonEnum.nullable() }).strict(),
  ]),
})

export async function POST(request: NextRequest) {
  const { org } = await requireUserAndOrg()

  if (!(await rateLimit(`bulk:${org.id}`, 30, 60))) {
    return NextResponse.json(
      { error: 'Too many bulk edits — wait a minute and try again.' },
      { status: 429 },
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  try {
    const updated = await bulkEditFields({
      orgId: org.id,
      fieldIds: parsed.data.field_ids,
      set: parsed.data.set,
    })
    return NextResponse.json({ updated })
  } catch (e) {
    console.error('[fields/bulk-edit] failed', e)
    return NextResponse.json({ error: 'Bulk edit failed. Please try again.' }, { status: 500 })
  }
}
