import { NextResponse } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireUserAndOrg()
  const { id } = await params
  const supabase = await createClient()
  const { data: step } = await supabase
    .from('fly_plans')
    .select('group_id')
    .eq('org_id', org.id)
    .eq('id', id)
    .maybeSingle()
  const { error } = await supabase.from('fly_plans').delete().eq('org_id', org.id).eq('id', id)
  if (error) {
    console.error('[fly-plans] delete failed', error)
    return NextResponse.json({ error: 'Could not delete the step.' }, { status: 500 })
  }
  if (step?.group_id) await refreshGroupCompletion(org.id, step.group_id)
  return NextResponse.json({ ok: true })
}

// Mark a step completed — work was logged from it. When the LAST step of a
// plan completes, the whole plan is stamped complete (it stays selectable as
// a layer; history matters to growers).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireUserAndOrg()
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (body?.completed !== true) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const supabase = await createClient()
  const { data: step, error } = await supabase
    .from('fly_plans')
    .update({ completed_at: new Date().toISOString() })
    .eq('org_id', org.id)
    .eq('id', id)
    .select('group_id')
    .maybeSingle()
  if (error) {
    console.error('[fly-plans] complete failed', error)
    return NextResponse.json({ error: 'Could not complete the step.' }, { status: 500 })
  }
  let groupCompleted = false
  if (step?.group_id) groupCompleted = await refreshGroupCompletion(org.id, step.group_id)
  return NextResponse.json({ ok: true, group_completed: groupCompleted })
}

// Group is complete exactly when it has steps and none are open. Returns the
// resulting completed state.
async function refreshGroupCompletion(orgId: string, groupId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: steps } = await supabase
    .from('fly_plans')
    .select('completed_at')
    .eq('org_id', orgId)
    .eq('group_id', groupId)
  const all = steps ?? []
  const done = all.length > 0 && all.every((s) => s.completed_at !== null)
  await supabase
    .from('plan_groups')
    .update({ completed_at: done ? new Date().toISOString() : null })
    .eq('org_id', orgId)
    .eq('id', groupId)
  return done
}
