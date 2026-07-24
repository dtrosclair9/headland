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
  colorBy: z.enum(['stage', 'variety']).optional(),
  /** farm default paper size, saved alongside the label picks (print) */
  paper: z.enum(['letter', 'legal', 'tabloid']).optional(),
})

// Save the farm's default map/print label fields (+ optional color-by, paper).
// Bumps view_defaults_updated_at so the new default supersedes older per-device
// overrides on next load.
export async function POST(request: NextRequest) {
  const { org } = await requireUserAndOrg()
  const body = await request.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const updatedAt = new Date().toISOString()
  const supabase = await createClient()
  const { error } = await supabase
    .from('organizations')
    .update({
      label_fields: parsed.data.fields,
      ...(parsed.data.colorBy ? { default_color_by: parsed.data.colorBy } : {}),
      ...(parsed.data.paper ? { print_paper: parsed.data.paper } : {}),
      view_defaults_updated_at: updatedAt,
    })
    .eq('id', org.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, updatedAt })
}
