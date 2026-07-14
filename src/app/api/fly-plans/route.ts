import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'
import { listFlyPlans } from '@/lib/fly-plans'

export async function GET() {
  const { org } = await requireUserAndOrg()
  const plans = await listFlyPlans(org.id)
  return NextResponse.json({ plans })
}

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  block_ids: z.array(z.string().uuid()).min(1).max(10000),
})

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
  const { data, error } = await supabase
    .from('fly_plans')
    .insert({
      org_id: org.id,
      name: parsed.data.name,
      color: parsed.data.color,
      block_ids: parsed.data.block_ids,
      created_by: user.id,
    })
    .select('id, name, color, block_ids')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: data }, { status: 201 })
}
