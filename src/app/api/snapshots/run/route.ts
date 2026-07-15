import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateFarmSnapshot } from '@/lib/snapshots'
import { paginateAll } from '@/lib/paginate'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  // Orgs with at least one live block. Paginated: this returns one row per
  // active block PLATFORM-WIDE, and PostgREST caps responses at 1000 — without
  // paging, any org whose blocks all sort past row 1000 silently never got an
  // auto-snapshot once total platform blocks exceeded 1000.
  let orgIds: string[]
  try {
    const rows = await paginateAll<{ org_id: string }>((from, to) =>
      admin.from('fields').select('org_id').is('archived_at', null).range(from, to),
    )
    orgIds = Array.from(new Set(rows.map((r) => r.org_id)))
  } catch (e) {
    console.error('[snapshots/run] org query failed', e)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }

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
