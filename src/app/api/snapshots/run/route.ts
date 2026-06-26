import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateFarmSnapshot } from '@/lib/snapshots'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  // Orgs with at least one live block.
  const { data: rows, error: rowsError } = await admin.from('fields').select('org_id').is('archived_at', null)
  if (rowsError) {
    console.error('[snapshots/run] org query failed', rowsError)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
  const orgIds = Array.from(new Set((rows ?? []).map((r) => r.org_id)))

  let created = 0, skipped = 0, failed = 0
  for (const orgId of orgIds) {
    try {
      const res = await generateFarmSnapshot(orgId, 'auto')
      res.skipped ? skipped++ : created++
    } catch (e) {
      failed++
      console.error('[snapshots/run] failed for org', orgId, e)
    }
  }
  return NextResponse.json({ created, skipped, failed, orgs: orgIds.length })
}
