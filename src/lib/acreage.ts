import { createAdminClient } from '@/lib/supabase/admin'
import { paginateAll } from '@/lib/paginate'

// Total mapped acreage for an org — the billable quantity for per-acre pricing.
// Sums the cached acreage of every live (non-archived) block. acreage_cached is
// always stored in acres regardless of the org's display unit, so this is the
// correct meter for Stripe. The org-level acre_count_cached column is declared
// but never maintained, so we sum the source of truth here.
// Paginated: PostgREST caps responses at 1000 rows — without this, a farm past
// 1000 blocks would be silently UNDER-BILLED (only the first 1000 summed).
export async function getBillableAcres(orgId: string): Promise<number> {
  const admin = createAdminClient()
  try {
    const rows = await paginateAll<{ acreage_cached: number | null }>((from, to) =>
      admin
        .from('fields')
        .select('acreage_cached')
        .eq('org_id', orgId)
        .is('archived_at', null)
        .range(from, to),
    )
    const total = rows.reduce((sum, row) => sum + Number(row.acreage_cached ?? 0), 0)
    return Math.round(total)
  } catch {
    return 0
  }
}
