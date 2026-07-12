import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'
import { ALL_LABEL_FIELDS } from '@/lib/label-fields'

const Schema = z.object({
  fields: z
    .array(z.enum(ALL_LABEL_FIELDS as [string, ...string[]]))
    .min(1)
    .max(4),
})

// Save the farm's default print-label fields (which block facts print).
export async function POST(request: NextRequest) {
  const { org } = await requireUserAndOrg()
  const body = await request.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('organizations')
    .update({ print_label_fields: parsed.data.fields })
    .eq('id', org.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
