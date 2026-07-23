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
})

// Create an empty plan (program); steps get added one at a time via
// POST /api/fly-plans with this group's id.
export async function POST(request: NextRequest) {
  const { user, org } = await requireUserAndOrg()
  const body = await request.json().catch(() => null)
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plan_groups')
    .insert({ org_id: org.id, name: parsed.data.name, created_by: user.id })
    .select('id, name, created_at, completed_at')
    .single()
  if (error) {
    console.error('[plan-groups] create failed', error)
    return NextResponse.json({ error: 'Could not create the plan.' }, { status: 500 })
  }
  return NextResponse.json({ group: { ...data, steps: [] } }, { status: 201 })
}
