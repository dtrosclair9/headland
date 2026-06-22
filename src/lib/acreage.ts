import { createAdminClient } from '@/lib/supabase/admin'

// Total mapped acreage for an org — the billable quantity for per-acre pricing.
// Sums the cached acreage of every live (non-archived) block. acreage_cached is
// always stored in acres regardless of the org's display unit, so this is the
// correct meter for Stripe. The org-level acre_count_cached column is declared
// but never maintained, so we sum the source of truth here.
export async function getBillableAcres(orgId: string): Promise<number> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('fields')
    .select('acreage_cached')
    .eq('org_id', orgId)
    .is('archived_at', null)

  if (error || !data) return 0
  const total = data.reduce((sum, row) => sum + Number(row.acreage_cached ?? 0), 0)
  return Math.round(total)
}
