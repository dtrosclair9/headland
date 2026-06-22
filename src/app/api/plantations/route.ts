import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createPlantation, listPlantations } from '@/lib/plantations'

export async function GET() {
  const { org } = await requireUserAndOrg()
  const plantations = await listPlantations(org.id)
  return NextResponse.json({ plantations })
}

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  fsa_tract_number: z.string().trim().max(50).optional().nullable(),
  fsa_farm_number: z.string().trim().max(50).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
})

export async function POST(request: NextRequest) {
  const { org } = await requireUserAndOrg()
  const body = await request.json().catch(() => null)
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  try {
    const { id } = await createPlantation({
      orgId: org.id,
      name: parsed.data.name,
      fsa_tract_number: parsed.data.fsa_tract_number ?? null,
      fsa_farm_number: parsed.data.fsa_farm_number ?? null,
      notes: parsed.data.notes ?? null,
    })
    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: 'create_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
