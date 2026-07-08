import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields, listFieldsByIds } from '@/lib/fields'
import { buildPlantationSvg, buildSpraySvg } from '@/lib/plantation-map-svg'
import { getOrgColors } from '@/lib/org-colors'
import { listAnnotations } from '@/lib/annotations'
import { resolveStageColors, resolveVarietyColors } from '@/lib/resolve-colors'
import PlatSheet from '@/components/print/PlatSheet'

export const metadata: Metadata = { title: 'Print selected blocks' }

export default async function SelectedBlocksPrintPage({
  searchParams,
}: {
  searchParams: Promise<{
    ids?: string
    style?: string
    highlight?: string
    scope?: string
    colorby?: string
  }>
}) {
  const {
    ids: idsRaw,
    style: styleRaw,
    highlight: highlightRaw,
    scope: scopeRaw,
    colorby: colorbyRaw,
  } = await searchParams
  const { org } = await requireUserAndOrg()
  const colorOverrides = await getOrgColors(org.id)
  const stageColors = resolveStageColors(colorOverrides.stage)
  const annotations = await listAnnotations(org.id)
  const isSpray = styleRaw === 'spray'
  // highlight=1 (a layer print): the ids are a HIGHLIGHT — the sheet draws
  // every block in the context, white with black outlines, and only the ids
  // get their colors. A plant-cane selection is useless on paper without the
  // surrounding blocks.
  const isHighlight = highlightRaw === '1'
  // Mirrors the map's Color-by toggle: paint highlighted blocks by variety
  // instead of year cane.
  const byVariety = colorbyRaw === 'variety'

  const ids = (idsRaw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const idSet = new Set(ids)
  // Context for a highlight sheet: the whole operation, or — when the layer
  // selection included plantations — just those plantations ('__none' =
  // unassigned blocks).
  const scope = (scopeRaw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const scopeSet = scope.length > 0 ? new Set(scope) : null
  const allBlocks = isHighlight ? await listFields(org.id) : await listFieldsByIds(ids)
  const blocks =
    isHighlight && scopeSet
      ? allBlocks.filter((b) => scopeSet.has(b.plantation_id ?? '__none'))
      : allBlocks

  // Variety colors resolve over the WHOLE operation's varieties (same as the
  // map), so a scoped sheet's colors match what the farmer sees on screen.
  const varietyColors = resolveVarietyColors(
    allBlocks.map((b) => b.variety),
    colorOverrides.variety,
  )

  const unitsArpents = org.units_default === 'arpents'
  const buildOpts = {
    unitsArpents,
    annotations,
    stageColors: colorOverrides.stage,
    ...(byVariety ? { paletteBy: 'variety' as const, varietyColors } : {}),
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
  // Legend: only what's actually present among the counted (highlighted)
  // blocks — context blocks are white and need no legend entry.
  let legendItems: { key: string; color: string; label: string }[] = []
  if (!isSpray) {
    if (byVariety) {
      const countedVarieties = Array.from(
        new Set(counted.flatMap((b) => (b.variety ? [b.variety] : []))),
      ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      legendItems = countedVarieties.map((v) => ({
        key: v,
        color: varietyColors[v],
        label: v,
      }))
    } else {
      const countedStages = new Set<string>(
        counted.flatMap((b) => (b.current_ratoon ? [b.current_ratoon] : [])),
      )
      legendItems = stageColors.filter((r) => countedStages.has(r.key))
    }
  }

  return (
    <PlatSheet
      orgName={org.name}
      title={isSpray ? 'Spray map' : isHighlight ? 'Highlighted blocks' : 'Selected blocks'}
      meta={meta}
      svg={svg}
      legendItems={legendItems}
      hasUnset={!isHighlight && !byVariety && !!svg?.hasUnset}
      today={today}
      unitWord={unitsArpents ? 'arpents' : 'acres'}
      emptyMessage="No blocks selected to print."
      style={isSpray ? 'spray' : 'crop'}
      colorNote={byVariety ? 'Colored by variety.' : undefined}
    />
  )
}
