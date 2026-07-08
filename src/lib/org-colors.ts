import { createClient } from '@/lib/supabase/server'

// Per-farm color overrides, keyed by kind. Empty maps = all defaults.
export interface OrgColorOverrides {
  stage: Record<string, string>
  variety: Record<string, string>
}

export const NO_COLOR_OVERRIDES: OrgColorOverrides = { stage: {}, variety: {} }

export async function getOrgColors(orgId: string): Promise<OrgColorOverrides> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('org_colors')
    .select('kind, key, color')
    .eq('org_id', orgId)
  if (error) throw error
  const out: OrgColorOverrides = { stage: {}, variety: {} }
  for (const row of data ?? []) {
    if (row.kind === 'stage') out.stage[row.key] = row.color
    else if (row.kind === 'variety') out.variety[row.key] = row.color
  }
  return out
}
