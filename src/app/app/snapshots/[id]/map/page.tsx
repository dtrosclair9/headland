import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { getSnapshot } from '@/lib/snapshots'
import { loadSnapshotBlocks, inheritPlantations } from '@/lib/snapshot-map'
import { listFields } from '@/lib/fields'
import { getOrgColors } from '@/lib/org-colors'
import { listAnnotations } from '@/lib/annotations'
import MapShell from '@/components/map/MapShell'

export const metadata: Metadata = { title: 'Farm snapshot' }

function periodLabel(period: string) {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// The regular map interface pointed at an archived month: same layers panel
// (stages / varieties / plantation isolation + zoom), same color-by toggle,
// same print flow — but the blocks are the snapshot's, and nothing can be
// edited. "What did the farm look like in March?" answered with the real map.
export default async function SnapshotMapPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { org } = await requireUserAndOrg()
  const { id } = await params

  const snap = await getSnapshot(id)
  if (!snap || snap.org_id !== org.id) {
    return <main className="p-10 text-sm text-gray-600">Snapshot not found.</main>
  }

  const [rawBlocks, liveFields, colorOverrides, annotations] = await Promise.all([
    loadSnapshotBlocks(snap.storage_path),
    listFields(org.id),
    getOrgColors(org.id),
    listAnnotations(org.id),
  ])
  // Archived blocks carry no plantation — inherit today's assignments by
  // location so the layers panel groups by real plantation names.
  const blocks = inheritPlantations(rawBlocks ?? [], liveFields)

  return (
    <MapShell
      initialFields={blocks}
      units={org.units_default}
      state={org.state}
      colorOverrides={colorOverrides}
      initialAnnotations={annotations}
      initialFlyPlans={[]}
      focusFieldId={null}
      snapshot={{ id: snap.id, label: `${periodLabel(snap.period)} snapshot` }}
    />
  )
}
