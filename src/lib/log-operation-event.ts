import { createClient } from '@/lib/supabase/server'
import { listFields } from '@/lib/fields'
import { APPLICATION_LABELS } from '@/lib/application-types'
import { fetchOperationWeather } from '@/lib/operation-weather'
import { translateToSpanish } from '@/lib/translate'
import { fetchBurnCategory } from '@/lib/burn-category'

// THE way an operation gets recorded — one block or two hundred. Every log
// becomes an operation EVENT (the farmer's record is the pass, a snapshot,
// not per-block line items): point-in-time block snapshot for the record
// document, weather at the field, auto burn category on burn work, Spanish
// notes — plus the per-block child rows that power block pages. Used by the
// bulk API route and the single-block page actions alike.

export type OperationInput =
  | { kind: 'todo'; text: string }
  | {
      kind: 'application'
      type: string
      applied_at: string
      applied_time?: string | null
      burn_category?: string | null
      product?: string | null
      rate?: number | null
      unit?: string | null
      notes?: string | null
      /** extra columns for the per-block application rows (e.g. manual wind) */
      extraRow?: Record<string, unknown>
    }

export async function logOperationEvent(opts: {
  orgId: string
  userId: string
  blockIds: string[]
  op: OperationInput
  color?: string
  context?: string
}): Promise<{ ok: true; count: number; eventId: string } | { error: string; status: number }> {
  const { orgId, userId, blockIds, op, context } = opts
  const supabase = await createClient()

  const idSet = new Set(blockIds)
  const allBlocks = await listFields(orgId)
  const targets = allBlocks.filter((b) => idSet.has(b.id))
  if (targets.length === 0) return { error: 'no_valid_blocks', status: 400 }
  const scopePlantations = new Set(targets.map((b) => b.plantation_id ?? '__none'))
  const contextBlocks = allBlocks.filter((b) => scopePlantations.has(b.plantation_id ?? '__none'))
  const color = opts.color ?? (op.kind === 'todo' ? '#E8A33D' : '#DC2626')
  // Point-in-time BLOCK DATA of the touched plantation(s) — the record
  // document (/operations/events/[id]/print) re-renders sheets from this at
  // any paper size / label choice, with the print system's exact rules.
  const snapshotBlocks = contextBlocks.map((b) => ({
    id: b.id,
    name: b.name,
    variety: b.variety,
    current_ratoon: b.current_ratoon,
    acreage_cached: b.acreage_cached,
    arpents_cached: b.arpents_cached,
    plantation_id: b.plantation_id,
    plantation_name: b.plantation_name,
    centroid_lng: b.centroid_lng,
    centroid_lat: b.centroid_lat,
    geometry: b.geometry,
  }))
  const acres = targets.reduce((s, b) => s + Number(b.acreage_cached || 0), 0)
  // Only the ids that passed org validation — never the raw input. A stray
  // foreign id can't be persisted into the event or spawn a child row.
  const validIds = targets.map((b) => b.id)

  let title: string
  let detail: string | null = null
  let occurredAt: string
  if (op.kind === 'todo') {
    title = `To-do: ${op.text.length > 80 ? op.text.slice(0, 77) + '…' : op.text}`
    detail = op.text
    occurredAt = new Date().toISOString().slice(0, 10)
  } else {
    const label = APPLICATION_LABELS[op.type] ?? op.type
    const rate = op.rate ? ` — ${op.rate}${op.unit ? ` ${op.unit}` : ''}` : ''
    title = op.product?.trim() ? `${label} · ${op.product.trim()}${rate}` : label
    detail = op.notes?.trim() || null
    occurredAt = op.applied_at
  }
  if (context?.trim()) title = `${context.trim()} — ${title}`

  // Record-keeping extras, all best-effort in parallel: weather at the field
  // when it happened (that hour if a time was given, else the day), a Spanish
  // copy of the notes for the crew printout, and — on burn work with no
  // manual pick — the official NWS Category Day for the farm's fire zone.
  const occurredTime = op.kind === 'application' ? (op.applied_time ?? null) : null
  const repLat = targets.reduce((s, b) => s + b.centroid_lat, 0) / targets.length
  const repLng = targets.reduce((s, b) => s + b.centroid_lng, 0) / targets.length
  const isBurnWork =
    op.kind === 'application' && (op.type === 'pre_harvest_burn' || op.type === 'post_harvest_burn')
  const manualBurnCat = op.kind === 'application' ? (op.burn_category ?? null) : null
  const [weather, detailEs, autoBurn] = await Promise.all([
    fetchOperationWeather(repLat, repLng, occurredAt, occurredTime),
    detail ? translateToSpanish(detail) : Promise.resolve(null),
    isBurnWork && !manualBurnCat
      ? fetchBurnCategory(repLat, repLng, occurredAt)
      : Promise.resolve(null),
  ])

  const { data: event, error: eventError } = await supabase
    .from('operation_events')
    .insert({
      org_id: orgId,
      kind: op.kind,
      title,
      detail,
      color,
      block_ids: validIds,
      block_count: targets.length,
      acres,
      snapshot_blocks: snapshotBlocks,
      occurred_at: occurredAt,
      occurred_time: occurredTime,
      burn_category: manualBurnCat ?? autoBurn?.category ?? null,
      burn_category_source: manualBurnCat ? 'manual' : (autoBurn?.source ?? null),
      weather,
      detail_es: detailEs,
      created_by: userId,
    })
    .select('id')
    .single()
  if (eventError) return { error: eventError.message, status: 500 }

  if (op.kind === 'todo') {
    const rows = validIds.map((field_id) => ({
      field_id,
      text: op.text,
      created_by: userId,
      event_id: event.id,
    }))
    const { error } = await supabase.from('block_tasks').insert(rows)
    if (error) return { error: error.message, status: 500 }
  } else {
    const rows = validIds.map((field_id) => ({
      field_id,
      type: op.type,
      applied_at: op.applied_at,
      product: op.product?.trim() || null,
      rate: op.rate ?? null,
      unit: op.unit?.trim() || null,
      notes: op.notes?.trim() || null,
      applied_by: userId,
      event_id: event.id,
      ...(op.extraRow ?? {}),
    }))
    const { error } = await supabase.from('applications').insert(rows)
    if (error) return { error: error.message, status: 500 }
  }
  return { ok: true, count: targets.length, eventId: event.id }
}
