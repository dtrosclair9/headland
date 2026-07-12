import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'
import { listAnnotations } from '@/lib/annotations'

export async function GET() {
  const { org } = await requireUserAndOrg()
  const annotations = await listAnnotations(org.id)
  return NextResponse.json({ annotations })
}

const Position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])

const CreateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('line'),
    geometry: z.object({
      type: z.literal('LineString'),
      coordinates: z.array(Position).min(2).max(500),
    }),
  }),
  z.object({
    kind: z.literal('text'),
    geometry: z.object({ type: z.literal('Point'), coordinates: Position }),
    text: z.string().trim().min(1).max(120),
    size: z.number().int().min(8).max(64).optional(),
    rotation: z.number().int().min(-180).max(180).optional(),
  }),
])

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
    .from('map_annotations')
    .insert({
      org_id: org.id,
      kind: parsed.data.kind,
      geometry: parsed.data.geometry,
      text: parsed.data.kind === 'text' ? parsed.data.text : null,
      size: parsed.data.kind === 'text' ? (parsed.data.size ?? 16) : 16,
      rotation: parsed.data.kind === 'text' ? (parsed.data.rotation ?? 0) : 0,
      created_by: user.id,
    })
    .select('id, kind, geometry, text, color, size, rotation')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ annotation: data }, { status: 201 })
}
