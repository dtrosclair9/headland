import { createClient } from '@/lib/supabase/server'
import { APPLICATION_LABELS } from './application-types'

// One row in the farm-wide operations feed: every per-block record type
// (to-dos, applications/field ops, harvests, scouting, rotations) normalized
// to a common shape so the Operations page can show one month-grouped
// timeline without opening blocks one by one.
export type OperationKind = 'todo' | 'application' | 'harvest' | 'scouting' | 'rotation' | 'event'

export interface OperationEntry {
  id: string
  kind: OperationKind
  /** ISO date used for sorting + month grouping */
  date: string
  blockId: string
  blockName: string
  plantation: string | null
  title: string
  detail: string | null
  /** todos only */
  done?: boolean
  /** bulk events only — what the event was (todo/application) */
  subKind?: 'todo' | 'application'
  blockCount?: number
  acres?: number
  color?: string
  /** the event stored a point-in-time snapshot — links to its record page */
  hasSnapshot?: boolean
  /** optional time of operation (HH:MM) */
  time?: string | null
  /** LDAF smoke category day (1–5) for burn field work */
  burnCategory?: string | null
  /** weather at the field when it happened */
  weatherSummary?: string | null
  /** plantations the event touched */
  plantations?: string[]
}

export { APPLICATION_LABELS } from './application-types'

const STAGE_LABELS: Record<string, string> = {
  plant_cane: 'Plant cane',
  first_stubble: '1st stubble',
  second_stubble: '2nd stubble',
  third_stubble: '3rd stubble',
  fourth_stubble: '4th stubble',
  fifth_stubble_plus: '5th stubble',
  sixth_stubble_plus: '6th+ stubble',
  fallow: 'Fallow',
}

// Embedded-join shape PostgREST returns for the parent block.
interface FieldRef {
  id: string
  name: string
  plantations: { name: string } | null
}

function blockBits(f: FieldRef | null) {
  return {
    blockId: f?.id ?? '',
    blockName: f?.name ?? 'Unknown block',
    plantation: f?.plantations?.name ?? null,
  }
}

const FIELD_EMBED = 'fields!inner(id, name, org_id, plantations(name))'

export interface OperationsData {
  openTodos: OperationEntry[]
  history: OperationEntry[]
  /** true when the month window cut older records off */
  hasOlder: boolean
}

// Loads the farm-wide feed. `sinceMonths` bounds the HISTORY window (open
// to-dos always load in full — they're actionable regardless of age).
export async function listOperations(orgId: string, sinceMonths: number): Promise<OperationsData> {
  const supabase = await createClient()
  const since = new Date()
  since.setMonth(since.getMonth() - sinceMonths)
  const sinceIso = since.toISOString()
  const sinceDate = sinceIso.slice(0, 10)

  const [todosQ, appsQ, harvestsQ, scoutingQ, rotationsQ, eventsQ, fieldsQ] = await Promise.all([
    supabase
      .from('block_tasks')
      .select(`id, text, done, created_at, completed_at, ${FIELD_EMBED}`)
      .eq('fields.org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('applications')
      .select(`id, applied_at, product, type, rate, unit, notes, ${FIELD_EMBED}`)
      .eq('fields.org_id', orgId)
      .is('event_id', null)
      .gte('applied_at', sinceDate)
      .order('applied_at', { ascending: false })
      .limit(3000),
    supabase
      .from('harvests')
      .select(`id, harvest_year, tons_total, tons_per_acre, notes, created_at, ${FIELD_EMBED}`)
      .eq('fields.org_id', orgId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('scouting_pins')
      .select(`id, category, note, created_at, ${FIELD_EMBED}`)
      .eq('fields.org_id', orgId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('field_cycle_history')
      .select(`id, crop_year, previous_stage, new_stage, created_at, ${FIELD_EMBED}`)
      .eq('fields.org_id', orgId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('operation_events')
      .select('id, kind, title, detail, color, block_ids, block_count, acres, has_snapshot, occurred_at, occurred_time, burn_category, weather')
      .eq('org_id', orgId)
      .gte('occurred_at', sinceDate)
      .order('occurred_at', { ascending: false })
      .limit(300),
    // Block id -> plantation name, to tag events with the plantations touched.
    supabase.from('fields_view').select('id, plantation_name').eq('org_id', orgId).limit(5000),
  ])
  for (const q of [todosQ, appsQ, harvestsQ, scoutingQ, rotationsQ, eventsQ, fieldsQ]) {
    if (q.error) throw q.error
  }

  /* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST embed rows */
  const openTodos: OperationEntry[] = []
  const history: OperationEntry[] = []

  for (const t of (todosQ.data ?? []) as any[]) {
    const entry: OperationEntry = {
      id: t.id,
      kind: 'todo',
      date: t.done ? (t.completed_at ?? t.created_at) : t.created_at,
      ...blockBits(t.fields),
      title: t.done ? 'To-do completed' : 'To-do',
      detail: t.text,
      done: t.done,
    }
    if (t.done) {
      if (entry.date >= sinceIso) history.push(entry)
    } else {
      openTodos.push(entry)
    }
  }

  for (const a of (appsQ.data ?? []) as any[]) {
    const label = APPLICATION_LABELS[a.type] ?? a.type
    const rate = a.rate ? ` — ${Number(a.rate)}${a.unit ? ` ${a.unit}` : ''}` : ''
    history.push({
      id: a.id,
      kind: 'application',
      date: a.applied_at,
      ...blockBits(a.fields),
      title: a.product ? `${label} · ${a.product}${rate}` : label,
      detail: a.notes ?? null,
    })
  }

  for (const h of (harvestsQ.data ?? []) as any[]) {
    const tpa = h.tons_per_acre ? ` · ${Number(h.tons_per_acre)} t/ac` : ''
    const tons = h.tons_total ? ` · ${Number(h.tons_total)} tons` : ''
    history.push({
      id: h.id,
      kind: 'harvest',
      date: h.created_at,
      ...blockBits(h.fields),
      title: `Harvest ${h.harvest_year}${tpa}${tons}`,
      detail: h.notes ?? null,
    })
  }

  for (const s of (scoutingQ.data ?? []) as any[]) {
    history.push({
      id: s.id,
      kind: 'scouting',
      date: s.created_at,
      ...blockBits(s.fields),
      title: `Scouting · ${String(s.category).replace(/_/g, ' ')}`,
      detail: s.note ?? null,
    })
  }

  // Rotations roll up: a season advance touches every block at once, and
  // sixty "Rotated 2nd → 3rd" line items is noise — the farmer's record is
  // "the season rolled." One card per day + transition + crop year.
  const rotationGroups = new Map<string, { rows: any[]; from: string; to: string; year: string }>()
  for (const r of (rotationsQ.data ?? []) as any[]) {
    const from = r.previous_stage ? (STAGE_LABELS[r.previous_stage] ?? r.previous_stage) : 'unset'
    const to = STAGE_LABELS[r.new_stage] ?? r.new_stage
    const day = String(r.created_at).slice(0, 10)
    const key = `${day}|${from}|${to}|${r.crop_year}`
    const g = rotationGroups.get(key) ?? { rows: [], from, to, year: String(r.crop_year) }
    g.rows.push(r)
    rotationGroups.set(key, g)
  }
  for (const [key, g] of rotationGroups) {
    const first = g.rows[0]
    if (g.rows.length === 1) {
      history.push({
        id: first.id,
        kind: 'rotation',
        date: first.created_at,
        ...blockBits(first.fields),
        title: `Rotated · ${g.from} → ${g.to} (${g.year})`,
        detail: null,
      })
      continue
    }
    history.push({
      id: `rot-${key}`,
      kind: 'rotation',
      date: first.created_at,
      blockId: '',
      blockName: `${g.rows.length} blocks`,
      plantation: null,
      title: `Season advanced · ${g.from} → ${g.to} (${g.year})`,
      detail: null,
    })
  }
  const plantationByBlock = new Map<string, string>(
    ((fieldsQ.data ?? []) as any[]).map((f) => [f.id, f.plantation_name ?? 'Unassigned']),
  )
  for (const ev of (eventsQ.data ?? []) as any[]) {
    const plantations = Array.from(
      new Set(
        (ev.block_ids as string[]).map((id) => plantationByBlock.get(id)).filter(Boolean),
      ),
    ) as string[]
    history.push({
      id: ev.id,
      kind: 'event',
      date: ev.occurred_at,
      blockId: '',
      blockName: '',
      plantation: plantations[0] ?? null,
      title: ev.title,
      detail: ev.detail ?? null,
      subKind: ev.kind,
      blockCount: ev.block_count,
      acres: ev.acres ? Number(ev.acres) : undefined,
      color: ev.color,
      hasSnapshot: !!ev.has_snapshot,
      time: ev.occurred_time ? String(ev.occurred_time).slice(0, 5) : null,
      burnCategory: ev.burn_category ?? null,
      weatherSummary: (ev.weather as { summary?: string } | null)?.summary ?? null,
      plantations,
    })
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  history.sort((a, b) => (a.date < b.date ? 1 : -1))
  openTodos.sort((a, b) => (a.date < b.date ? 1 : -1))

  // "Older exists" probe: any application older than the window is enough of
  // a signal to offer the button (cheap single-row checks).
  const older = await supabase
    .from('applications')
    .select(`id, ${FIELD_EMBED}`)
    .eq('fields.org_id', orgId)
    .lt('applied_at', sinceDate)
    .limit(1)
  const hasOlder = (older.data?.length ?? 0) > 0

  return { openTodos, history, hasOlder }
}
