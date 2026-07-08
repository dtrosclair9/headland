import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFieldsByIds } from '@/lib/fields'
import { buildPlantationSvg, buildSpraySvg } from '@/lib/plantation-map-svg'
import { getOrgColors } from '@/lib/org-colors'
import { listAnnotations } from '@/lib/annotations'
import { resolveStageColors } from '@/lib/resolve-colors'
import PlatSheet from '@/components/print/PlatSheet'

export const metadata: Metadata = { title: 'Print selected blocks' }

export default async function SelectedBlocksPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; style?: string }>
}) {
  const { ids: idsRaw, style: styleRaw } = await searchParams
  const { org } = await requireUserAndOrg()
  const colorOverrides = await getOrgColors(org.id)
  const stageColors = resolveStageColors(colorOverrides.stage)
  const annotations = await listAnnotations(org.id)
  const isSpray = styleRaw === 'spray'

  const ids = (idsRaw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const blocks = await listFieldsByIds(ids)

  const unitsArpents = org.units_default === 'arpents'
  const svg = isSpray
    ? buildSpraySvg(blocks, { unitsArpents, annotations })
    : buildPlantationSvg(blocks, { unitsArpents, stageColors: colorOverrides.stage, annotations })

  const totalAcres = blocks.reduce((s, b) => s + Number(b.acreage_cached || 0), 0)
  const totalArpents = blocks.reduce((s, b) => s + Number(b.arpents_cached || 0), 0)
  const totalLabel = unitsArpents ? `${totalArpents.toFixed(2)} arp` : `${totalAcres.toFixed(2)} ac`
  const meta = `${blocks.length} block${blocks.length === 1 ? '' : 's'} · ${totalLabel}`

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const legendItems = isSpray || !svg ? [] : stageColors.filter((r) => svg.stagesPresent.includes(r.key))

  return (
    <PlatSheet
      orgName={org.name}
      title={isSpray ? 'Spray map' : 'Selected blocks'}
      meta={meta}
      svg={svg}
      legendItems={legendItems}
      hasUnset={!!svg?.hasUnset}
      today={today}
      unitWord={unitsArpents ? 'arpents' : 'acres'}
      emptyMessage="No blocks selected to print."
      style={isSpray ? 'spray' : 'crop'}
    />
  )
}
