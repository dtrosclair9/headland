import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUserAndOrg } from '@/lib/orgs'
import { getPlantation } from '@/lib/plantations'
import { listFieldsByPlantation } from '@/lib/fields'
import { buildPlantationSvg, buildSpraySvg, parsePaperSize } from '@/lib/plantation-map-svg'
import { getOrgColors } from '@/lib/org-colors'
import { listAnnotations } from '@/lib/annotations'
import { resolveStageColors } from '@/lib/resolve-colors'
import { parseLabelFields, type LabelField } from '@/lib/label-fields'
import PlatSheet from '@/components/print/PlatSheet'

export const metadata: Metadata = { title: 'Print plantation' }

export default async function PlantationPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ style?: string; labels?: string; paper?: string }>
}) {
  const { id } = await params
  const { style: styleRaw, labels: labelsRaw, paper: paperRaw } = await searchParams
  const { org } = await requireUserAndOrg()
  const colorOverrides = await getOrgColors(org.id)
  const stageColors = resolveStageColors(colorOverrides.stage)
  const annotations = await listAnnotations(org.id)
  const plantation = await getPlantation(id)
  if (!plantation || plantation.org_id !== org.id) notFound()

  const isSpray = styleRaw === 'spray'
  const blocks = await listFieldsByPlantation(id)
  const unitsArpents = org.units_default === 'arpents'
  const labelFields = parseLabelFields(
    labelsRaw,
    parseLabelFields(org.print_label_fields as LabelField[] | undefined),
  )
  const labelFieldSet = new Set(labelFields)
  const paper = parsePaperSize(paperRaw ?? (org.print_paper as string | undefined))
  const svg = isSpray
    ? buildSpraySvg(blocks, { unitsArpents, annotations, labelFields: labelFieldSet, paper })
    : buildPlantationSvg(blocks, {
        unitsArpents,
        stageColors: colorOverrides.stage,
        annotations,
        labelFields: labelFieldSet,
      paper,
      })

  const totalAcres = blocks.reduce((s, b) => s + Number(b.acreage_cached || 0), 0)
  const totalArpents = blocks.reduce((s, b) => s + Number(b.arpents_cached || 0), 0)
  const totalLabel = unitsArpents ? `${totalArpents.toFixed(2)} arp` : `${totalAcres.toFixed(2)} ac`
  const meta =
    `${blocks.length} block${blocks.length === 1 ? '' : 's'} · ${totalLabel}` +
    (plantation.fsa_farm_number ? ` · Farm ${plantation.fsa_farm_number}` : '') +
    (plantation.fsa_tract_number ? ` · Tract ${plantation.fsa_tract_number}` : '')

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const legendItems = isSpray || !svg ? [] : stageColors.filter((r) => svg.stagesPresent.includes(r.key))

  return (
    <PlatSheet
      orgName={org.name}
      sheets={[
        {
          title: isSpray ? `${plantation.name} — spray map` : plantation.name,
          meta,
          svg,
          legendItems,
          hasUnset: !!svg?.hasUnset,
        },
      ]}
      today={today}
      unitWord={unitsArpents ? 'arpents' : 'acres'}
      emptyMessage="No blocks in this plantation yet. Assign blocks to it from the map, then print."
      style={isSpray ? 'spray' : 'crop'}
      activeLabelFields={labelFields}
      paper={paper}
    />
  )
}
