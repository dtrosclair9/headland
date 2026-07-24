import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'
import { getPlanGroup } from '@/lib/fly-plans'
import { listAnnotations } from '@/lib/annotations'
import { buildSpraySvg, parsePaperSize } from '@/lib/plantation-map-svg'
import { groupByPlantation } from '@/lib/print-groups'
import { parseLabelFields, type LabelField } from '@/lib/label-fields'
import PlatSheet, { type SheetData } from '@/components/print/PlatSheet'

export const metadata: Metadata = { title: 'Print plan' }

// The whole plan on paper: ONE PAGE PER PLANTATION the plan touches, every
// step's blocks filled in that step's color, with a legend naming each step
// and its acreage (what the pilot bills by). Per-step sheets still print from
// each step's own Print link.
export default async function PlanGroupPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ labels?: string; paper?: string }>
}) {
  const { id } = await params
  const { labels: labelsRaw, paper: paperRaw } = await searchParams
  const { org } = await requireUserAndOrg()
  const group = await getPlanGroup(org.id, id)
  if (!group || group.steps.length === 0) notFound()

  const [blocks, annotations] = await Promise.all([listFields(org.id), listAnnotations(org.id)])
  const byId = new Map(blocks.map((b) => [b.id, b]))

  // id -> step color; a block sits in exactly one step (enforced on create).
  const colorById = new Map<string, string>()
  for (const step of group.steps) for (const bid of step.block_ids) colorById.set(bid, step.color)
  const idSet = new Set(colorById.keys())
  const planBlocks = blocks.filter((b) => idSet.has(b.id))

  // Only the plantation(s) the plan's blocks sit in — each on its own page.
  const scopePlantations = new Set(planBlocks.map((b) => b.plantation_id ?? '__none'))
  const contextBlocks = blocks.filter((b) => scopePlantations.has(b.plantation_id ?? '__none'))

  const unitsArpents = org.units_default === 'arpents'
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const stepLegend = (stepBlockIds: string[]) => {
    const live = stepBlockIds.filter((bid) => byId.has(bid))
    const acres = live.reduce((s, bid) => s + Number(byId.get(bid)!.acreage_cached || 0), 0)
    const arpents = live.reduce((s, bid) => s + Number(byId.get(bid)!.arpents_cached || 0), 0)
    return { count: live.length, total: unitsArpents ? `${arpents.toFixed(2)} arp` : `${acres.toFixed(2)} ac` }
  }

  const labelFields = parseLabelFields(
    labelsRaw,
    parseLabelFields(org.label_fields as LabelField[] | undefined),
  )
  const labelFieldSet = new Set(labelFields)
  const paper = parsePaperSize(paperRaw ?? (org.print_paper as string | undefined))
  const sheets: SheetData[] = groupByPlantation(contextBlocks).map((sheetGroup) => {
    const svg = buildSpraySvg(sheetGroup.blocks, {
      unitsArpents,
      annotations,
      labelFields: labelFieldSet,
      paper,
      highlight: { ids: idSet, colors: colorById },
    })
    const counted = sheetGroup.blocks.filter((b) => idSet.has(b.id))
    const totalAcres = counted.reduce((s, b) => s + Number(b.acreage_cached || 0), 0)
    const totalArpents = counted.reduce((s, b) => s + Number(b.arpents_cached || 0), 0)
    const totalLabel = unitsArpents
      ? `${totalArpents.toFixed(2)} arp`
      : `${totalAcres.toFixed(2)} ac`
    return {
      title: `${group.name} — ${sheetGroup.name}`,
      meta: `${counted.length} block${counted.length === 1 ? '' : 's'} in this plan · ${totalLabel}`,
      svg,
      // Every step in the legend with its own color + billed acreage, so one
      // master sheet reads the whole program at a glance.
      legendItems: group.steps.map((step) => {
        const { count, total } = stepLegend(step.block_ids)
        return {
          key: step.id,
          color: step.color,
          label: `${step.name} — ${count} block${count === 1 ? '' : 's'} · ${total}${step.completed_at ? ' ✓' : ''}`,
        }
      }),
      hasUnset: false,
    }
  })

  return (
    <PlatSheet
      orgName={org.name}
      sheets={sheets}
      today={today}
      unitWord={unitsArpents ? 'arpents' : 'acres'}
      emptyMessage="This plan has no blocks."
      style="spray"
      activeLabelFields={labelFields}
      paper={paper}
    />
  )
}
