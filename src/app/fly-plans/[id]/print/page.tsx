import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'
import { getFlyPlan } from '@/lib/fly-plans'
import { listAnnotations } from '@/lib/annotations'
import { buildSpraySvg, parsePaperSize } from '@/lib/plantation-map-svg'
import { groupByPlantation } from '@/lib/print-groups'
import { parseLabelFields, type LabelField } from '@/lib/label-fields'
import PlatSheet, { type SheetData } from '@/components/print/PlatSheet'

export const metadata: Metadata = { title: 'Print fly plan' }

// The pilot's sheets: ONE PAGE PER PLANTATION the plan touches. Each page
// shows that plantation's blocks in white with black outlines (context) and
// the plan's blocks filled in the plan color — "spray only the colored
// blocks". Hand-drawn roads/labels print too.
export default async function FlyPlanPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ labels?: string; paper?: string }>
}) {
  const { id } = await params
  const { labels: labelsRaw, paper: paperRaw } = await searchParams
  const { org } = await requireUserAndOrg()
  const plan = await getFlyPlan(org.id, id)
  if (!plan) notFound()

  const [blocks, annotations] = await Promise.all([listFields(org.id), listAnnotations(org.id)])
  const idSet = new Set(plan.block_ids)
  const planBlocks = blocks.filter((b) => idSet.has(b.id))

  // Only the plantation(s) the plan's blocks sit in — and each on its own page.
  const scopePlantations = new Set(planBlocks.map((b) => b.plantation_id ?? '__none'))
  const contextBlocks = blocks.filter((b) => scopePlantations.has(b.plantation_id ?? '__none'))

  const unitsArpents = org.units_default === 'arpents'
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const labelFields = parseLabelFields(
    labelsRaw,
    parseLabelFields(org.print_label_fields as LabelField[] | undefined),
  )
  const labelFieldSet = new Set(labelFields)
  const paper = parsePaperSize(paperRaw)
  const sheets: SheetData[] = groupByPlantation(contextBlocks).map((group) => {
    const svg = buildSpraySvg(group.blocks, {
      unitsArpents,
      annotations,
      labelFields: labelFieldSet,
      paper,
      highlight: { ids: idSet, color: plan.color },
    })
    const counted = group.blocks.filter((b) => idSet.has(b.id))
    const totalAcres = counted.reduce((s, b) => s + Number(b.acreage_cached || 0), 0)
    const totalArpents = counted.reduce((s, b) => s + Number(b.arpents_cached || 0), 0)
    const totalLabel = unitsArpents
      ? `${totalArpents.toFixed(2)} arp`
      : `${totalAcres.toFixed(2)} ac`
    return {
      title: `${plan.name} — ${group.name}`,
      meta: `${counted.length} block${counted.length === 1 ? '' : 's'} in this plan · ${totalLabel}`,
      svg,
      legendItems: [{ key: 'plan', color: plan.color, label: 'Planned blocks' }],
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
