import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import {
  archiveField,
  getField,
  updateFieldGeometry,
  updateFieldMetadata,
} from '@/lib/fields'
import { getPlantation } from '@/lib/plantations'

const PolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]).rest(z.number()))),
})

const PatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  variety: z.string().max(50).nullable().optional(),
  plant_date: z.string().date().nullable().optional(),
  current_ratoon: z
    .enum([
      'plant_cane',
      'first_stubble',
      'second_stubble',
      'third_stubble',
      'fourth_stubble',
      'fifth_stubble_plus',
      'sixth_stubble_plus',
      'fallow',
    ])
    .nullable()
    .optional(),
  notes: z.string().max(2000).nullable().optional(),
  plantation_id: z.string().uuid().nullable().optional(),
  geometry: PolygonSchema.optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { org } = await requireUserAndOrg()
  const { id } = await params
  const field = await getField(id, org.id)
  if (!field) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ field })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { org } = await requireUserAndOrg()
  const { id } = await params
  // Confirm the block is THIS org's before any write — a 404 for someone
  // else's id, never a silent reach into another farm.
  if (!(await getField(id, org.id))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const body = await request.json().catch(() => null)
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })
  }

  // A plantation id must belong to THIS org (parity with bulk-plantation) —
  // otherwise a field can silently point at a foreign plantation UUID.
  if (parsed.data.plantation_id) {
    const plantation = await getPlantation(parsed.data.plantation_id)
    if (!plantation || plantation.org_id !== org.id) {
      return NextResponse.json({ error: 'plantation_not_found' }, { status: 404 })
    }
  }

  const { geometry, ...metadata } = parsed.data
  try {
    if (geometry) {
      await updateFieldGeometry({ fieldId: id, geometry: geometry as GeoJSON.Polygon })
    }
    if (Object.keys(metadata).length > 0) {
      await updateFieldMetadata(id, metadata)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: 'update_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { org } = await requireUserAndOrg()
  const { id } = await params
  if (!(await getField(id, org.id))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  try {
    await archiveField(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: 'archive_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
