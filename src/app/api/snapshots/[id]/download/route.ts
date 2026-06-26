import { NextResponse } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { getSnapshot } from '@/lib/snapshots'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireUserAndOrg()
  const { id } = await params
  const snap = await getSnapshot(id)
  if (!snap || snap.org_id !== org.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from('farm-snapshots').createSignedUrl(snap.storage_path, 60)
  if (error || !data) return NextResponse.json({ error: 'download_failed' }, { status: 500 })
  return NextResponse.redirect(data.signedUrl)
}
