import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'

const Position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])

// Move / reshape / restyle an existing annotation. Partial: any subset of the
// editable fields; geometry accepts either shape (kind can't change).
const PatchSchema = z
  .object({
    geometry: z.union([
      z.object({ type: z.literal('LineString'), coordinates: z.array(Position).min(2).max(500) }),
      z.object({ type: z.literal('Point'), coordinates: Position }),
    ]),
    text: z.string().trim().min(1).max(120),
    size: z.number().int().min(8).max(64),
    rotation: z.number().int().min(-180).max(180),
    width: z.number().min(1).max(8).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'empty patch' })

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireUserAndOrg()
  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('map_annotations')
    .update(parsed.data)
    .eq('org_id', org.id)
    .eq('id', id)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireUserAndOrg()
  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase
    .from('map_annotations')
    .delete()
    .eq('org_id', org.id)
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
