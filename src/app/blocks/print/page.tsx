import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields, listFieldsByIds } from '@/lib/fields'
import { buildPlantationSvg, buildSpraySvg } from '@/lib/plantation-map-svg'
import { getOrgColors } from '@/lib/org-colors'
import { listAnnotations } from '@/lib/annotations'
import { resolveStageColors } from '@/lib/resolve-colors'
import PlatSheet from '@/components/print/PlatSheet'

export const metadata: Metadata = { title: 'Print selected blocks' }

export default async function SelectedBlocksPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; style?: string; highlight?: string }>
}) {
  const { ids: idsRaw, style: styleRaw, highlight: highlightRaw } = await searchParams
  const { org } = await requireUserAndOrg()
  const colorOverrides = await getOrgColors(org.id)
  const stageColors = resolveStageColors(colorOverrides.stage)
  const annotations = await listAnnotations(org.id)
  const isSpray = styleRaw === 'spray'
  // highlight=1 (a layer print): the ids are a HIGHLIGHT — the sheet draws
  // EVERY block on the farm for context, white with black outlines, and only
  // the ids get their colors. A plant-cane selection is useless on paper
  // without the surrounding blocks.
  const isHighlight = highlightRaw === '1'

  const ids = (idsRaw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const idSet = new Set(ids)
  const blocks = isHighlight ? await listFields(org.id) : await listFieldsByIds(ids)

  const unitsArpents = org.units_default === 'arpents'
  const buildOpts = {
    unitsArpents,
    annotations,
    stageColors: colorOverrides.stage,
    ...(isHighlight ? { highlight: { ids: idSet } } : {}),
  }
  const svg = isSpray ? buildSpraySvg(blocks, buildOpts) : buildPlantationSvg(blocks, buildOpts)

  // Totals reflect the selection (the highlighted ids), not the context blocks.
  const counted = isHighlight ? blocks.filter((b) => idSet.has(b.id)) : blocks
  const totalAcres = counted.reduce((s, b) => s + Number(b.acreage_cached || 0), 0)
  const totalArpents = counted.reduce((s, b) => s + Number(b.arpents_cached || 0), 0)
  const totalLabel = unitsArpents ? `${totalArpents.toFixed(2)} arp` : `${totalAcres.toFixed(2)} ac`
  const meta = `${counted.length} block${counted.length === 1 ? '' : 's'}${isHighlight ? ' highlighted' : ''} · ${totalLabel}`

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  // Legend: only the stages actually present among the counted (highlighted)
  // blocks — context blocks are white and need no legend entry.
  const countedStages = new Set<string>(
    counted.flatMap((b) => (b.current_ratoon ? [b.current_ratoon] : [])),
  )
  const legendItems = isSpray ? [] : stageColors.filter((r) => countedStages.has(r.key))

  return (
    <PlatSheet
      orgName={org.name}
      title={isSpray ? 'Spray map' : isHighlight ? 'Highlighted blocks' : 'Selected blocks'}
      meta={meta}
      svg={svg}
      legendItems={legendItems}
      hasUnset={!isHighlight && !!svg?.hasUnset}
      today={today}
      unitWord={unitsArpents ? 'arpents' : 'acres'}
      emptyMessage="No blocks selected to print."
      style={isSpray ? 'spray' : 'crop'}
    />
  )
}
