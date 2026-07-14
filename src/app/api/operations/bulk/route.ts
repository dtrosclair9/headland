import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { APPLICATION_TYPE_KEYS } from '@/lib/application-types'
import { logOperationEvent } from '@/lib/log-operation-event'
import { rateLimit } from '@/lib/rate-limit'

// Bulk-log one operation onto many blocks at once: a to-do ("spray johnson
// grass" on 15 blocks) or a field-work application (a plan flown — same
// product/date across every block). Thin validation wrapper around
// logOperationEvent — the single path every operation record goes through.
const BulkSchema = z.object({
  block_ids: z.array(z.string().uuid()).min(1).max(10000),
  /** event highlight color (a plan's color); defaults by kind */
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  /** event title prefix, e.g. the plan name */
  context: z.string().trim().max(100).optional(),
  op: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('todo'),
      text: z.string().trim().min(1).max(500),
    }),
    z.object({
      kind: z.literal('application'),
      type: z.enum(APPLICATION_TYPE_KEYS as [string, ...string[]]),
      applied_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      /** optional time of operation (HH:MM) — weather then records that hour */
      applied_time: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
      /** LDAF smoke category day (1–5); blank on burn work = auto-fetch */
      burn_category: z.enum(['1', '2', '3', '4', '5']).optional(),
      product: z.string().trim().max(200).optional(),
      rate: z.number().positive().max(100000).optional(),
      unit: z.string().trim().max(20).optional(),
      notes: z.string().trim().max(1000).optional(),
    }),
  ]),
})

export async function POST(request: NextRequest) {
  const { user, org } = await requireUserAndOrg()
  // Heaviest write path (up to 2000 rows + 3 external API calls each) — cap
  // it well above any human pace but low enough to stop a runaway script.
  if (!(await rateLimit(`bulk:${org.id}`, 30, 60))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const body = await request.json().catch(() => null)
  const parsed = BulkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const result = await logOperationEvent({
    orgId: org.id,
    userId: user.id,
    blockIds: parsed.data.block_ids,
    op: parsed.data.op,
    color: parsed.data.color,
    context: parsed.data.context,
  })
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(
    { ok: true, count: result.count, event_id: result.eventId },
    { status: 201 },
  )
}
