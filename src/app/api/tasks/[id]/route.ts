import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { setBlockTaskDone } from '@/lib/block-tasks'

const PatchSchema = z.object({ done: z.boolean() })

// Complete (or reopen) a to-do from anywhere — the Operations page checks
// them off farm-wide without opening each block. Org scoping enforced by RLS
// on block_tasks.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUserAndOrg()
  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  await setBlockTaskDone({ taskId: id, done: parsed.data.done, userId: user.id })
  return NextResponse.json({ ok: true })
}
