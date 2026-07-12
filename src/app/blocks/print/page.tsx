import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields, listFieldsByIds } from '@/lib/fields'
import { buildPlantationSvg, buildSpraySvg } from '@/lib/plantation-map-svg'
import { getOrgColors } from '@/lib/org-colors'
import { listAnnotations } from '@/lib/annotations'
import { resolveStageColors, resolveVarietyColors } from '@/lib/resolve-colors'
import { groupByPlantation } from '@/lib/print-groups'
import { parseLabelFields, type LabelField } from '@/lib/label-fields'
import PlatSheet, { type SheetData } from '@/components/print/PlatSheet'

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
    labels?: string
  }>
}) {
  const {
    ids: idsRaw,
    style: styleRaw,
    highlight: highlightRaw,
    scope: scopeRaw,
    colorby: colorbyRaw,
    labels: labelsRaw,
  } = await searchParams
  const { org } = await requireUserAndOrg()
  const colorOverrides = await getOrgColors(org.id)
  const stageColors = resolveStageColors(colorOverrides.stage)
  const annotations = await listAnnotations(org.id)
  const isSpray = styleRaw === 'spray'
  // highlight=1 (a layer print): the ids are a HIGHLIGHT — each page draws
  // every block of its plantation, white with black outlines, and only the
  // ids get their colors. A plant-cane selection is useless on paper without
  // the surrounding blocks.
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
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  // Which block facts print: ?labels= override, else the farm's saved preset.
  const labelFields = parseLabelFields(
    labelsRaw,
    parseLabelFields(org.print_label_fields as LabelField[] | undefined),
  )
  const labelFieldSet = new Set(labelFields)

  // ONE PAGE PER PLANTATION — a selection spanning three plantations prints
  // as three individual sheets, each titled by its plantation. Plantations
  // with nothing highlighted are skipped (no all-white wasted pages).
  const sheets: SheetData[] = groupByPlantation(blocks).flatMap((group) => {
    if (isHighlight && !group.blocks.some((b) => idSet.has(b.id))) return []
    const buildOpts = {
      unitsArpents,
      annotations,
      labelFields: labelFieldSet,
      stageColors: colorOverrides.stage,
      ...(byVariety ? { paletteBy: 'variety' as const, varietyColors } : {}),
      ...(isHighlight ? { highlight: { ids: idSet } } : {}),
    }
    const svg = isSpray
      ? buildSpraySvg(group.blocks, buildOpts)
      : buildPlantationSvg(group.blocks, buildOpts)

    // Totals reflect the selection (highlighted ids) within this plantation.
    const counted = isHighlight ? group.blocks.filter((b) => idSet.has(b.id)) : group.blocks
    const totalAcres = counted.reduce((s, b) => s + Number(b.acreage_cached || 0), 0)
    const totalArpents = counted.reduce((s, b) => s + Number(b.arpents_cached || 0), 0)
    const totalLabel = unitsArpents
      ? `${totalArpents.toFixed(2)} arp`
      : `${totalAcres.toFixed(2)} ac`
    const meta = `${counted.length} block${counted.length === 1 ? '' : 's'}${isHighlight ? ' highlighted' : ''} · ${totalLabel}`

    // Legend: only what's actually present among the counted blocks on THIS
    // page — context blocks are white and need no legend entry.
    let legendItems: { key: string; color: string; label: string }[] = []
    if (!isSpray) {
      if (byVariety) {
        const countedVarieties = Array.from(
          new Set(counted.flatMap((b) => (b.variety ? [b.variety] : []))),
        ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        legendItems = countedVarieties.map((v) => ({ key: v, color: varietyColors[v], label: v }))
      } else {
        const countedStages = new Set<string>(
          counted.flatMap((b) => (b.current_ratoon ? [b.current_ratoon] : [])),
        )
        legendItems = stageColors.filter((r) => countedStages.has(r.key))
      }
    }

    return [
      {
        title: group.name,
        meta,
        svg,
        legendItems,
        hasUnset: !isHighlight && !byVariety && !!svg?.hasUnset,
      },
    ]
  })

  return (
    <PlatSheet
      orgName={org.name}
      sheets={sheets}
      today={today}
      unitWord={unitsArpents ? 'arpents' : 'acres'}
      emptyMessage="No blocks selected to print."
      style={isSpray ? 'spray' : 'crop'}
      activeLabelFields={labelFields}
    />
  )
}
