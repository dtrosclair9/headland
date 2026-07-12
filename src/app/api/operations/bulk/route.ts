import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'
import { listFields } from '@/lib/fields'
import { APPLICATION_TYPE_KEYS, APPLICATION_LABELS } from '@/lib/application-types'
import { fetchOperationWeather } from '@/lib/operation-weather'
import { translateToSpanish } from '@/lib/translate'

// Bulk-log one operation onto many blocks at once: a to-do ("spray johnson
// grass" on 15 blocks) or a field-work application (a plan flown — same
// product/date across every block). Creates ONE operation event carrying a
// point-in-time crop-map snapshot (what was done where), plus the per-block
// rows (tagged with the event) that power block pages. Org scoping enforced
// by RLS on all target tables.
const BulkSchema = z.object({
  block_ids: z.array(z.string().uuid()).min(1).max(2000),
  /** event highlight color (a plan's color); defaults by kind */
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  /** event title prefix, e.g. the plan name */
  context: z.string().trim().max(100).optional(),
  op: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('todo'),
      text: z.string().trim().min(1).max(500),
    }),
    z.object({
      kind: z.literal('application'),
      type: z.enum(APPLICATION_TYPE_KEYS as [string, ...string[]]),
      applied_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      /** optional time of operation (HH:MM) — weather then records that hour */
      applied_time: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
      /** LDAF smoke category day (1–5), for burn field work */
      burn_category: z.enum(['1', '2', '3', '4', '5']).optional(),
      product: z.string().trim().max(200).optional(),
      rate: z.number().positive().max(100000).optional(),
      unit: z.string().trim().max(20).optional(),
      notes: z.string().trim().max(1000).optional(),
    }),
  ]),
})

export async function POST(request: NextRequest) {
  const { user, org } = await requireUserAndOrg()
  const body = await request.json().catch(() => null)
  const parsed = BulkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const { block_ids, op, context } = parsed.data
  const supabase = await createClient()

  // Build the event: title, acreage, and the crop-map snapshot (spray-style
  // sheet of the touched plantation(s) with the event blocks colored).
  const idSet = new Set(block_ids)
  const allBlocks = await listFields(org.id)
  const targets = allBlocks.filter((b) => idSet.has(b.id))
  if (targets.length === 0) {
    return NextResponse.json({ error: 'no_valid_blocks' }, { status: 400 })
  }
  const scopePlantations = new Set(targets.map((b) => b.plantation_id ?? '__none'))
  const contextBlocks = allBlocks.filter((b) => scopePlantations.has(b.plantation_id ?? '__none'))
  const color = parsed.data.color ?? (op.kind === 'todo' ? '#E8A33D' : '#DC2626')
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
  // when it happened (that hour if a time was given, else the day), and a
  // Spanish copy of the notes for the crew printout.
  const occurredTime = op.kind === 'application' ? (op.applied_time ?? null) : null
  const repLat = targets.reduce((s, b) => s + b.centroid_lat, 0) / targets.length
  const repLng = targets.reduce((s, b) => s + b.centroid_lng, 0) / targets.length
  const [weather, detailEs] = await Promise.all([
    fetchOperationWeather(repLat, repLng, occurredAt, occurredTime),
    detail ? translateToSpanish(detail) : Promise.resolve(null),
  ])

  const { data: event, error: eventError } = await supabase
    .from('operation_events')
    .insert({
      org_id: org.id,
      kind: op.kind,
      title,
      detail,
      color,
      block_ids,
      block_count: targets.length,
      acres,
      snapshot_blocks: snapshotBlocks,
      occurred_at: occurredAt,
      occurred_time: occurredTime,
      burn_category: op.kind === 'application' ? (op.burn_category ?? null) : null,
      weather,
      detail_es: detailEs,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })

  if (op.kind === 'todo') {
    const rows = block_ids.map((field_id) => ({
      field_id,
      text: op.text,
      created_by: user.id,
      event_id: event.id,
    }))
    const { error } = await supabase.from('block_tasks').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const rows = block_ids.map((field_id) => ({
      field_id,
      type: op.type,
      applied_at: op.applied_at,
      product: op.product?.trim() || null,
      rate: op.rate ?? null,
      unit: op.unit?.trim() || null,
      notes: op.notes?.trim() || null,
      applied_by: user.id,
      event_id: event.id,
    }))
    const { error } = await supabase.from('applications').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, count: targets.length, event_id: event.id }, { status: 201 })
}
