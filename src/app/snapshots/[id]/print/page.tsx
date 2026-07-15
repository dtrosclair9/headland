import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { getSnapshot } from '@/lib/snapshots'
import { loadSnapshotBlocks, clusterByProximity, inheritPlantations } from '@/lib/snapshot-map'
import { listFields } from '@/lib/fields'
import { listAnnotations } from '@/lib/annotations'
import { buildPlantationSvg, parsePaperSize } from '@/lib/plantation-map-svg'
import { getOrgColors } from '@/lib/org-colors'
import { resolveStageColors } from '@/lib/resolve-colors'
import { groupByPlantation } from '@/lib/print-groups'
import { parseLabelFields } from '@/lib/label-fields'
import PlatSheet, { type SheetData } from '@/components/print/PlatSheet'

export const metadata: Metadata = { title: 'Farm snapshot map' }

function periodLabel(period: string) {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// The farm EXACTLY as it stood when the snapshot was taken — the crop-map
// schematic farmers actually think in, rebuilt from the archive's geojson.
// One page per plantation, printable like any live plat. This is a record
// view, so no auto-print.
export default async function SnapshotMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ paper?: string; labels?: string; plantation?: string }>
}) {
  const { id } = await params
  const { paper: paperRaw, labels: labelsRaw, plantation: plantationRaw } = await searchParams
  const { org } = await requireUserAndOrg()

  const snap = await getSnapshot(id)
  if (!snap || snap.org_id !== org.id) {
    return (
      <main className="p-10 text-sm text-gray-600">Snapshot not found.</main>
    )
  }

  const [rawBlocks, liveFields, colorOverrides, annotations] = await Promise.all([
    loadSnapshotBlocks(snap.storage_path),
    listFields(org.id),
    getOrgColors(org.id),
    listAnnotations(org.id),
  ])
  // Old snapshots stored no plantation per block — inherit today's
  // assignments by location so pages carry real names, not "Unassigned".
  const allSnapshotBlocks = inheritPlantations(rawBlocks ?? [], liveFields)
  // ?plantation=<id|__none>: print just that plantation's page(s).
  const blocks = plantationRaw
    ? allSnapshotBlocks.filter((b) => (b.plantation_id ?? '__none') === plantationRaw)
    : allSnapshotBlocks
  const stageColors = resolveStageColors(colorOverrides.stage)
  const unitsArpents = org.units_default === 'arpents'
  // A record document shows ALL FOUR block facts by default (id, variety,
  // cycle, acres) — ?labels= can still trim it.
  const labelFields = parseLabelFields(labelsRaw)
  const labelFieldSet = new Set(labelFields)
  const paper = parsePaperSize(paperRaw ?? (org.print_paper as string | undefined))

  // One page per plantation — and when a group's blocks span areas miles
  // apart (the Unassigned bucket especially), split it into one page per
  // geographic cluster so each sheet frames one real place instead of
  // zooming out to confetti.
  const sheets: SheetData[] = groupByPlantation(blocks).flatMap((group) => {
    const clusters = clusterByProximity(group.blocks)
    return clusters.map((clusterBlocks, ci) => {
      const svg = buildPlantationSvg(clusterBlocks, {
        unitsArpents,
        annotations,
        labelFields: labelFieldSet,
        paper,
        stageColors: colorOverrides.stage,
      })
      const totalAcres = clusterBlocks.reduce((s, b) => s + Number(b.acreage_cached || 0), 0)
      const totalArpents = clusterBlocks.reduce((s, b) => s + Number(b.arpents_cached || 0), 0)
      const totalLabel = unitsArpents
        ? `${totalArpents.toFixed(2)} arp`
        : `${totalAcres.toFixed(2)} ac`
      const stagesPresent = new Set<string>(
        clusterBlocks.flatMap((b) => (b.current_ratoon ? [b.current_ratoon] : [])),
      )
      return {
        title: clusters.length > 1 ? `${group.name} — area ${ci + 1}` : group.name,
        meta: `${clusterBlocks.length} block${clusterBlocks.length === 1 ? '' : 's'} · ${totalLabel}`,
        svg,
        legendItems: stageColors.filter((r) => stagesPresent.has(r.key)),
        hasUnset: !!svg?.hasUnset,
      }
    })
  })

  const taken = new Date(snap.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <PlatSheet
      orgName={`${org.name} — ${periodLabel(snap.period)} snapshot`}
      sheets={sheets}
      today={taken}
      unitWord={unitsArpents ? 'arpents' : 'acres'}
      emptyMessage="This snapshot has no map data (it may predate block archiving)."
      style="crop"
      activeLabelFields={labelFields}
      paper={paper}
      autoPrint={false}
    />
  )
}
