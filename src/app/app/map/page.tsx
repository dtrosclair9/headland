import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'
import { getOrgColors } from '@/lib/org-colors'
import { listAnnotations } from '@/lib/annotations'
import { listFlyPlans } from '@/lib/fly-plans'
import MapShell from '@/components/map/MapShell'

export const metadata: Metadata = { title: 'Block map' }

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>
}) {
  const { org } = await requireUserAndOrg()
  const { focus } = await searchParams
  const [fields, colorOverrides, annotations, flyPlans] = await Promise.all([
    listFields(org.id),
    getOrgColors(org.id),
    listAnnotations(org.id),
    listFlyPlans(org.id),
  ])

  return (
    <MapShell
      initialFields={fields}
      units={org.units_default}
      state={org.state}
      colorOverrides={colorOverrides}
      initialAnnotations={annotations}
      initialFlyPlans={flyPlans}
      focusFieldId={focus ?? null}
    />
  )
}
