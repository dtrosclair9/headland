import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'
import { getFlyPlan } from '@/lib/fly-plans'
import { listAnnotations } from '@/lib/annotations'
import { buildSpraySvg } from '@/lib/plantation-map-svg'
import PlatSheet from '@/components/print/PlatSheet'

export const metadata: Metadata = { title: 'Print fly plan' }

// The pilot's sheet: EVERY block on the farm in white with black outlines
// (context), the plan's blocks filled in the plan color — "spray only the
// colored blocks". Hand-drawn roads/labels print too.
export default async function FlyPlanPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { org } = await requireUserAndOrg()
  const plan = await getFlyPlan(org.id, id)
  if (!plan) notFound()

  const [blocks, annotations] = await Promise.all([listFields(org.id), listAnnotations(org.id)])
  const idSet = new Set(plan.block_ids)
  const planBlocks = blocks.filter((b) => idSet.has(b.id))

  // Context = ONLY the plantation(s) the plan's blocks sit in. A pilot flying
  // Rosedale gets Rosedale's blocks — not the whole operation shrunk down.
  // Plans spanning two plantations print both.
  const scopePlantations = new Set(planBlocks.map((b) => b.plantation_id ?? '__none'))
  const contextBlocks = blocks.filter((b) => scopePlantations.has(b.plantation_id ?? '__none'))

  const unitsArpents = org.units_default === 'arpents'
  const svg = buildSpraySvg(contextBlocks, {
    unitsArpents,
    annotations,
    highlight: { ids: idSet, color: plan.color },
  })
  const totalAcres = planBlocks.reduce((s, b) => s + Number(b.acreage_cached || 0), 0)
  const totalArpents = planBlocks.reduce((s, b) => s + Number(b.arpents_cached || 0), 0)
  const totalLabel = unitsArpents ? `${totalArpents.toFixed(2)} arp` : `${totalAcres.toFixed(2)} ac`
  const meta = `${planBlocks.length} block${planBlocks.length === 1 ? '' : 's'} to spray · ${totalLabel}`

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <PlatSheet
      orgName={org.name}
      title={`Fly plan — ${plan.name}`}
      meta={meta}
      svg={svg}
      legendItems={[{ key: 'plan', color: plan.color, label: 'Spray these blocks' }]}
      hasUnset={false}
      today={today}
      unitWord={unitsArpents ? 'arpents' : 'acres'}
      emptyMessage="This fly plan has no blocks."
      style="spray"
    />
  )
}
