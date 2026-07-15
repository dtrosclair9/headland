import { createClient } from '@/lib/supabase/server'
import type { BlockTask } from '@/lib/types'
import { paginateAll } from '@/lib/paginate'

// All queries are org-scoped by RLS (block_tasks policy checks org membership
// via the parent block's org), so callers only pass field/task ids.

export async function listBlockTasks(fieldId: string): Promise<BlockTask[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('block_tasks')
    .select('*')
    .eq('field_id', fieldId)
    // Open items first, then newest within each group.
    .order('done', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as BlockTask[]
}

export async function createBlockTask(input: {
  fieldId: string
  text: string
  createdBy: string
}): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('block_tasks').insert({
    field_id: input.fieldId,
    text: input.text,
    created_by: input.createdBy,
  })
  if (error) throw error
}

// fieldId (when the caller knows it) scopes the mutation to a block they've
// verified they own; orgId scopes via the parent-field join for callers that
// only have a task id. Either way tenant isolation never hinges on RLS alone.
export async function setBlockTaskDone(input: {
  taskId: string
  done: boolean
  userId: string
  fieldId?: string
  orgId?: string
}): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  if (input.orgId && !input.fieldId) {
    // Resolve + verify the task's parent block belongs to this org first.
    const { data: task, error: taskErr } = await supabase
      .from('block_tasks')
      .select('id, fields!inner(org_id)')
      .eq('id', input.taskId)
      .eq('fields.org_id', input.orgId)
      .maybeSingle()
    if (taskErr) throw taskErr
    if (!task) return { ok: false }
  }
  let q = supabase
    .from('block_tasks')
    .update({
      done: input.done,
      completed_at: input.done ? new Date().toISOString() : null,
      completed_by: input.done ? input.userId : null,
    })
    .eq('id', input.taskId)
  if (input.fieldId) q = q.eq('field_id', input.fieldId)
  const { data, error } = await q.select('id')
  if (error) throw error
  return { ok: (data?.length ?? 0) > 0 }
}

export async function deleteBlockTask(taskId: string, fieldId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('block_tasks')
    .delete()
    .eq('id', taskId)
    .eq('field_id', fieldId)
  if (error) throw error
}

// Open-task count per block, for the map sidebar badges. Tallied in JS
// (PostgREST has no GROUP BY count). Scoped by ORG via a join — one query
// that returns only the (few) open tasks — instead of feeding every field id
// into an .in() filter. That old approach both overflowed the request URL on
// big farms AND was slow: 2000 blocks meant 20 sequential round-trips (~1.5s);
// this org-join is a single ~50ms query. Paginated for the rare farm with
// 1000+ open to-dos.
export async function openTaskCountsByOrg(orgId: string): Promise<Record<string, number>> {
  const supabase = await createClient()
  const rows = await paginateAll<{ field_id: string }>((from, to) =>
    supabase
      .from('block_tasks')
      .select('field_id, fields!inner(org_id)')
      .eq('fields.org_id', orgId)
      .eq('done', false)
      .range(from, to),
  )
  const counts: Record<string, number> = {}
  for (const row of rows) counts[row.field_id] = (counts[row.field_id] ?? 0) + 1
  return counts
}
