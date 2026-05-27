import { NextResponse, type NextRequest } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { archiveDitch } from '@/lib/ditches'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // RLS scopes the update to the caller's org, so a cross-org id is a no-op.
  await requireUserAndOrg()
  const { id } = await params
  try {
    await archiveDitch(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: 'archive_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
