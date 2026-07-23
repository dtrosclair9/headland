import { createClient } from '@/lib/supabase/server'

// A plan is a SET of colored steps that communicate (Lance's ask): "Ripener
// Program" holds "First Fly" purple on these blocks, "Second Fly" blue on
// those, etc. Steps are fly_plans rows; the set is a plan_groups row. While
// building the next step, blocks in earlier steps show locked in their
// colors; the whole program views and prints as one multi-color map and is
// selectable as a map layer (white map, program colors only).
export interface FlyPlanRow {
  id: string
  name: string
  color: string
  block_ids: string[]
  group_id: string | null
  position: number
  completed_at: string | null
}

export interface PlanGroupRow {
  id: string
  name: string
  created_at: string
  completed_at: string | null
  steps: FlyPlanRow[]
}

const STEP_COLS = 'id, name, color, block_ids, group_id, position, completed_at'

// Every program, finished or not — completed programs stay listed (they're
// selectable layers; spray history matters), the UI badges them done.
export async function listPlanGroups(orgId: string): Promise<PlanGroupRow[]> {
  const supabase = await createClient()
  const [groups, steps] = await Promise.all([
    supabase
      .from('plan_groups')
      .select('id, name, created_at, completed_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true }),
    supabase
      .from('fly_plans')
      .select(STEP_COLS)
      .eq('org_id', orgId)
      .not('group_id', 'is', null)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }),
  ])
  if (groups.error) throw groups.error
  if (steps.error) throw steps.error
  const byGroup = new Map<string, FlyPlanRow[]>()
  for (const s of (steps.data ?? []) as FlyPlanRow[]) {
    const list = byGroup.get(s.group_id as string) ?? []
    list.push(s)
    byGroup.set(s.group_id as string, list)
  }
  return ((groups.data ?? []) as Omit<PlanGroupRow, 'steps'>[]).map((g) => ({
    ...g,
    steps: byGroup.get(g.id) ?? [],
  }))
}

export async function getPlanGroup(orgId: string, id: string): Promise<PlanGroupRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plan_groups')
    .select('id, name, created_at, completed_at')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const { data: steps, error: stepsError } = await supabase
    .from('fly_plans')
    .select(STEP_COLS)
    .eq('org_id', orgId)
    .eq('group_id', id)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (stepsError) throw stepsError
  return { ...(data as Omit<PlanGroupRow, 'steps'>), steps: (steps ?? []) as FlyPlanRow[] }
}

export async function getFlyPlan(orgId: string, id: string): Promise<FlyPlanRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('fly_plans')
    .select(STEP_COLS)
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as FlyPlanRow) ?? null
}
