import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUserAndOrg } from '@/lib/orgs'
import { getPlantation } from '@/lib/plantations'
import { listFieldsByPlantation } from '@/lib/fields'
import { buildPlantationSvg } from '@/lib/plantation-map-svg'
import { RATOON_COLORS } from '@/lib/ratoon-colors'
import PlatSheet from '@/components/print/PlatSheet'

export const metadata: Metadata = { title: 'Print plantation' }

export default async function PlantationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { org } = await requireUserAndOrg()
  const plantation = await getPlantation(id)
  if (!plantation || plantation.org_id !== org.id) notFound()

  const blocks = await listFieldsByPlantation(id)
  const unitsArpents = org.units_default === 'arpents'
  const svg = buildPlantationSvg(blocks, { unitsArpents })

  const totalAcres = blocks.reduce((s, b) => s + Number(b.acreage_cached || 0), 0)
  const totalArpents = blocks.reduce((s, b) => s + Number(b.arpents_cached || 0), 0)
  const totalLabel = unitsArpents ? `${totalArpents.toFixed(2)} arp` : `${totalAcres.toFixed(2)} ac`
  const meta =
    `${blocks.length} block${blocks.length === 1 ? '' : 's'} · ${totalLabel}` +
    (plantation.fsa_farm_number ? ` · Farm ${plantation.fsa_farm_number}` : '') +
    (plantation.fsa_tract_number ? ` · Tract ${plantation.fsa_tract_number}` : '')

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const legendItems = svg ? RATOON_COLORS.filter((r) => svg.stagesPresent.includes(r.key)) : []

  return (
    <PlatSheet
      orgName={org.name}
      title={plantation.name}
      meta={meta}
      svg={svg}
      legendItems={legendItems}
      hasUnset={!!svg?.hasUnset}
      today={today}
      unitWord={unitsArpents ? 'arpents' : 'acres'}
      emptyMessage="No blocks in this plantation yet. Assign blocks to it from the map, then print."
    />
  )
}
