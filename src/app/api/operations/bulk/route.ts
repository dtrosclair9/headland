import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'
import { APPLICATION_TYPE_KEYS } from '@/lib/application-types'

// Bulk-log one operation onto many blocks at once: a to-do ("spray johnson
// grass" on 15 blocks) or a field-work application (a fly plan flown — same
// product/date across every block in the plan). Org scoping is enforced by
// RLS on the target tables: rows pointing at another org's blocks are
// rejected at insert.
const BulkSchema = z.object({
  block_ids: z.array(z.string().uuid()).min(1).max(2000),
  op: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('todo'),
      text: z.string().trim().min(1).max(500),
    }),
    z.object({
      kind: z.literal('application'),
      type: z.enum(APPLICATION_TYPE_KEYS as [string, ...string[]]),
      applied_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      product: z.string().trim().max(200).optional(),
      rate: z.number().positive().max(100000).optional(),
      unit: z.string().trim().max(20).optional(),
      notes: z.string().trim().max(1000).optional(),
    }),
  ]),
})

export async function POST(request: NextRequest) {
  const { user } = await requireUserAndOrg()
  const body = await request.json().catch(() => null)
  const parsed = BulkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const { block_ids, op } = parsed.data
  const supabase = await createClient()

  if (op.kind === 'todo') {
    const rows = block_ids.map((field_id) => ({
      field_id,
      text: op.text,
      created_by: user.id,
    }))
    const { error, count } = await supabase
      .from('block_tasks')
      .insert(rows, { count: 'exact' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, count: count ?? rows.length }, { status: 201 })
  }

  const rows = block_ids.map((field_id) => ({
    field_id,
    type: op.type,
    applied_at: op.applied_at,
    product: op.product?.trim() || null,
    rate: op.rate ?? null,
    unit: op.unit?.trim() || null,
    notes: op.notes?.trim() || null,
    applied_by: user.id,
  }))
  const { error, count } = await supabase.from('applications').insert(rows, { count: 'exact' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, count: count ?? rows.length }, { status: 201 })
}
