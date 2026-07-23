import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { rateLimit } from '@/lib/rate-limit'
import { bulkArchiveFields } from '@/lib/bulk-edit'

// A 10k-id bulk archive can run ~20s at 50k-acre scale.
export const maxDuration = 300

const Body = z.object({ field_ids: z.array(z.string().uuid()).min(1).max(10000) })

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
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  try {
    const archived = await bulkArchiveFields({ orgId: org.id, fieldIds: parsed.data.field_ids })
    return NextResponse.json({ archived })
  } catch (e) {
    console.error('[fields/bulk-archive] failed', e)
    return NextResponse.json({ error: 'Delete failed. Please try again.' }, { status: 500 })
  }
}
