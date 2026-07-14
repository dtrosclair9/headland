import { createClient } from '@/lib/supabase/server'
import type { BlockTask } from '@/lib/types'

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

export async function setBlockTaskDone(input: {
  taskId: string
  done: boolean
  userId: string
}): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('block_tasks')
    .update({
      done: input.done,
      completed_at: input.done ? new Date().toISOString() : null,
      completed_by: input.done ? input.userId : null,
    })
    .eq('id', input.taskId)
    .select('id') // RLS scopes the update; an empty result = not this org's task
  if (error) throw error
  return { ok: (data?.length ?? 0) > 0 }
}

export async function deleteBlockTask(taskId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('block_tasks').delete().eq('id', taskId)
  if (error) throw error
}

// Open-task count per block, for the map sidebar badges. Tallied in JS
// (PostgREST has no GROUP BY count). CRITICAL: the field-id list must be
// CHUNKED — a big farm (Boudreaux hit 681 blocks) puts every id into the
// request URL via .in(), and past ~430 ids the URL blows past PostgREST's
// 16KB header limit and the whole query (and the page that awaits it) 500s.
export async function openTaskCountsByFieldIds(
  fieldIds: string[],
): Promise<Record<string, number>> {
  if (fieldIds.length === 0) return {}
  const supabase = await createClient()
  const counts: Record<string, number> = {}
  const CHUNK = 100 // ~100 uuids ≈ 4KB URL, safely under the 16KB limit
  for (let i = 0; i < fieldIds.length; i += CHUNK) {
    const slice = fieldIds.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from('block_tasks')
      .select('field_id')
      .in('field_id', slice)
      .eq('done', false)
    if (error) throw error
    for (const row of (data ?? []) as { field_id: string }[]) {
      counts[row.field_id] = (counts[row.field_id] ?? 0) + 1
    }
  }
  return counts
}
