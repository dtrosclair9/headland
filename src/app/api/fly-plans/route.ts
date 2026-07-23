import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'
import { listPlanGroups } from '@/lib/fly-plans'

export async function GET() {
  const { org } = await requireUserAndOrg()
  const groups = await listPlanGroups(org.id)
  return NextResponse.json({ groups })
}

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  block_ids: z.array(z.string().uuid()).min(1).max(10000),
  group_id: z.string().uuid(),
  position: z.number().int().min(1).max(200),
})

// Add a step to a plan. Blocks already in the group's other steps are
// dropped server-side — a block belongs to exactly one step per plan (the
// map UI locks them; this guards the API path).
export async function POST(request: NextRequest) {
  const { user, org } = await requireUserAndOrg()
  const body = await request.json().catch(() => null)
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const supabase = await createClient()
  // Group must be the caller's own.
  const { data: group } = await supabase
    .from('plan_groups')
    .select('id')
    .eq('org_id', org.id)
    .eq('id', parsed.data.group_id)
    .maybeSingle()
  if (!group) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const { data: siblings } = await supabase
    .from('fly_plans')
    .select('block_ids')
    .eq('org_id', org.id)
    .eq('group_id', parsed.data.group_id)
  const taken = new Set((siblings ?? []).flatMap((s) => s.block_ids as string[]))
  const blockIds = parsed.data.block_ids.filter((id) => !taken.has(id))
  if (blockIds.length === 0) {
    return NextResponse.json(
      { error: 'Every picked block is already in another step of this plan.' },
      { status: 422 },
    )
  }
  const { data, error } = await supabase
    .from('fly_plans')
    .insert({
      org_id: org.id,
      name: parsed.data.name,
      color: parsed.data.color,
      block_ids: blockIds,
      group_id: parsed.data.group_id,
      position: parsed.data.position,
      created_by: user.id,
    })
    .select('id, name, color, block_ids, group_id, position, completed_at')
    .single()
  if (error) {
    console.error('[fly-plans] create failed', error)
    return NextResponse.json({ error: 'Could not save the step.' }, { status: 500 })
  }
  // A new (uncompleted) step reopens a previously completed plan.
  await supabase
    .from('plan_groups')
    .update({ completed_at: null })
    .eq('org_id', org.id)
    .eq('id', parsed.data.group_id)
  return NextResponse.json({ plan: data }, { status: 201 })
}
