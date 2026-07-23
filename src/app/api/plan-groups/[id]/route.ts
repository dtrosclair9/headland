import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'

// Delete a plan (program) — its steps cascade with it (group_id FK).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireUserAndOrg()
  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase.from('plan_groups').delete().eq('org_id', org.id).eq('id', id)
  if (error) {
    console.error('[plan-groups] delete failed', error)
    return NextResponse.json({ error: 'Could not delete the plan.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

const PatchSchema = z.object({ name: z.string().trim().min(1).max(100) })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireUserAndOrg()
  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('plan_groups')
    .update({ name: parsed.data.name })
    .eq('org_id', org.id)
    .eq('id', id)
  if (error) {
    console.error('[plan-groups] rename failed', error)
    return NextResponse.json({ error: 'Could not rename the plan.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
