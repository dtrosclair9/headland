import { createClient } from '@/lib/supabase/server'

// A named, colored block selection for a sprayer pilot: "1st spray" = red on
// these blocks. Viewed on the white plat map and printed as a B&W sheet with
// the plan's blocks filled in the plan color.
export interface FlyPlanRow {
  id: string
  name: string
  color: string
  block_ids: string[]
}

export async function listFlyPlans(orgId: string): Promise<FlyPlanRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('fly_plans')
    .select('id, name, color, block_ids')
    .eq('org_id', orgId)
    .is('completed_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as FlyPlanRow[]
}

export async function getFlyPlan(orgId: string, id: string): Promise<FlyPlanRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('fly_plans')
    .select('id, name, color, block_ids')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as FlyPlanRow) ?? null
}
