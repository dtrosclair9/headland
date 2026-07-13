import { NextResponse } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireUserAndOrg()
  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase.from('fly_plans').delete().eq('org_id', org.id).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Mark a plan completed — work was logged from it; the record lives in
// Operations and the plan leaves the Plans tab.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireUserAndOrg()
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (body?.completed !== true) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('fly_plans')
    .update({ completed_at: new Date().toISOString() })
    .eq('org_id', org.id)
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
