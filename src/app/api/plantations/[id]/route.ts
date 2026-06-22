import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { archivePlantation, getPlantation, updatePlantation } from '@/lib/plantations'

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  fsa_tract_number: z.string().trim().max(50).nullable().optional(),
  fsa_farm_number: z.string().trim().max(50).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
})

async function requireOwnedPlantation(plantationId: string) {
  const { org } = await requireUserAndOrg()
  const plantation = await getPlantation(plantationId)
  if (!plantation || plantation.org_id !== org.id) {
    return { ok: false as const, response: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  }
  return { ok: true as const, org, plantation }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const guard = await requireOwnedPlantation(id)
  if (!guard.ok) return guard.response

  const body = await request.json().catch(() => null)
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  try {
    await updatePlantation(id, parsed.data)
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
  const { id } = await params
  const guard = await requireOwnedPlantation(id)
  if (!guard.ok) return guard.response

  try {
    await archivePlantation(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: 'archive_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
