import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'
import { listFields, type FieldRow } from '@/lib/fields'
import { listAnnotations } from '@/lib/annotations'
import { buildSpraySvg, parsePaperSize } from '@/lib/plantation-map-svg'
import { groupByPlantation } from '@/lib/print-groups'
import { parseLabelFields, type LabelField } from '@/lib/label-fields'
import PlatSheet, { type SheetData } from '@/components/print/PlatSheet'
import NotesLangToggle from '@/components/print/NotesLangToggle'
import { fetchBurnCategory } from '@/lib/burn-category'

export const metadata: Metadata = { title: 'Operation record' }

// The record document for a completed operation event — reference and
// record keeping. One page per plantation touched, the event's blocks in
// the event color over white context, and the record facts (what, when,
// weather, burn category, notes) printed on every page. Sheets re-render
// from the event's point-in-time block snapshot, so paper size and label
// fields work exactly like every other print page.
export default async function OperationRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ labels?: string; paper?: string; lang?: string }>
}) {
  const { id } = await params
  const { labels: labelsRaw, paper: paperRaw, lang: langRaw } = await searchParams
  const { org } = await requireUserAndOrg()
  const supabase = await createClient()
  const { data: ev } = await supabase
    .from('operation_events')
    .select(
      'id, org_id, kind, title, detail, detail_es, color, block_ids, block_count, acres, occurred_at, occurred_time, burn_category, burn_category_source, weather, snapshot_blocks',
    )
    .eq('id', id)
    .single()
  if (!ev || ev.org_id !== org.id) notFound()

  // Point-in-time block data stored on the event; legacy events without it
  // fall back to the live blocks of the plantations the event touched.
  const idSet = new Set<string>(ev.block_ids ?? [])
  let blocks = (ev.snapshot_blocks as FieldRow[] | null) ?? []
  if (blocks.length === 0) {
    const live = await listFields(org.id)
    const scope = new Set(
      live.filter((b) => idSet.has(b.id)).map((b) => b.plantation_id ?? '__none'),
    )
    blocks = live.filter((b) => scope.has(b.plantation_id ?? '__none'))
  }
  const annotations = await listAnnotations(org.id)

  // Self-healing burn category: it's auto-fetched at log time, but if NWS or
  // the archive was unreachable that moment, fill it in on first view of the
  // record (the archive holds the official product for any past date).
  if (!ev.burn_category && ev.kind === 'application') {
    const { data: burnRows } = await supabase
      .from('applications')
      .select('type')
      .eq('event_id', ev.id)
      .in('type', ['pre_harvest_burn', 'post_harvest_burn'])
      .limit(1)
    const targets = blocks.filter((b) => idSet.has(b.id))
    if (burnRows?.length && targets.length) {
      const lat = targets.reduce((s, b) => s + b.centroid_lat, 0) / targets.length
      const lng = targets.reduce((s, b) => s + b.centroid_lng, 0) / targets.length
      const occurredAt =
        typeof ev.occurred_at === 'string'
          ? ev.occurred_at.slice(0, 10)
          : String(ev.occurred_at).slice(0, 10)
      const auto = await fetchBurnCategory(lat, lng, occurredAt)
      if (auto) {
        ev.burn_category = auto.category
        ev.burn_category_source = auto.source
        await supabase
          .from('operation_events')
          .update({ burn_category: auto.category, burn_category_source: auto.source })
          .eq('id', ev.id)
      }
    }
  }

  const unitsArpents = org.units_default === 'arpents'
  const labelFields = parseLabelFields(
    labelsRaw,
    parseLabelFields(org.label_fields as LabelField[] | undefined),
  )
  const labelFieldSet = new Set(labelFields)
  const paper = parsePaperSize(paperRaw ?? (org.print_paper as string | undefined))
  const lang = langRaw === 'es' ? ('es' as const) : ('en' as const)

  const color = ev.color ?? '#DC2626'
  const sheets: SheetData[] = groupByPlantation(blocks).map((group) => {
    const svg = buildSpraySvg(group.blocks, {
      unitsArpents,
      annotations,
      labelFields: labelFieldSet,
      paper,
      highlight: { ids: idSet, color },
    })
    const counted = group.blocks.filter((b) => idSet.has(b.id))
    const totalAcres = counted.reduce((s, b) => s + Number(b.acreage_cached || 0), 0)
    const totalArpents = counted.reduce((s, b) => s + Number(b.arpents_cached || 0), 0)
    const totalLabel = unitsArpents
      ? `${totalArpents.toFixed(2)} arp`
      : `${totalAcres.toFixed(2)} ac`
    return {
      title: `${ev.title} — ${group.name}`,
      meta: `${counted.length} block${counted.length === 1 ? '' : 's'} in this pass · ${totalLabel}`,
      svg,
      legendItems: [
        { key: 'event', color, label: ev.kind === 'todo' ? 'To-do blocks' : 'Blocks worked' },
      ],
      hasUnset: false,
    }
  })

  // The record line: kind · accomplished date (+ time) · weather · burn cat.
  const dateStr = new Date(`${ev.occurred_at}T12:00:00`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const timeStr = ev.occurred_time
    ? new Date(`2000-01-01T${ev.occurred_time}`).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null
  const when =
    (ev.kind === 'todo' ? `Logged ${dateStr}` : `Applied ${dateStr}`) +
    (timeStr ? ` · ${timeStr}` : '')
  const weatherSummary = (ev.weather as { summary?: string } | null)?.summary
  const recordLine = [
    ev.kind === 'todo' ? 'To-dos' : 'Field work',
    when,
    weatherSummary,
    ev.burn_category
      ? `Burn category ${ev.burn_category}${
          ev.burn_category_source && ev.burn_category_source !== 'manual' ? ' (NWS)' : ''
        }`
      : null,
  ]
    .filter(Boolean)
    .join('  ·  ')
  const notesRaw = lang === 'es' && ev.detail_es ? ev.detail_es : ev.detail
  const notes =
    notesRaw && notesRaw !== ev.title
      ? `${lang === 'es' ? 'Notas' : 'Notes'}: ${notesRaw}`
      : null

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <PlatSheet
      orgName={org.name}
      sheets={sheets}
      today={today}
      unitWord={unitsArpents ? 'arpents' : 'acres'}
      emptyMessage="This event has no map snapshot."
      style="spray"
      activeLabelFields={labelFields}
      paper={paper}
      autoPrint={false}
      record={{ line: recordLine, notes }}
      bannerExtra={ev.detail_es ? <NotesLangToggle active={lang} /> : undefined}
    />
  )
}
