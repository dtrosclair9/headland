import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'

// Set or reset one custom map color. color: hex to set an override, null to
// clear it back to the built-in default.
const SetSchema = z.object({
  kind: z.enum(['stage', 'variety']),
  key: z.string().trim().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
})

export async function POST(request: NextRequest) {
  const { org } = await requireUserAndOrg()
  const body = await request.json().catch(() => null)
  const parsed = SetSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const { kind, key, color } = parsed.data
  const supabase = await createClient()
  if (color === null) {
    const { error } = await supabase
      .from('org_colors')
      .delete()
      .eq('org_id', org.id)
      .eq('kind', kind)
      .eq('key', key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('org_colors')
      .upsert({ org_id: org.id, kind, key, color, updated_at: new Date().toISOString() })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
