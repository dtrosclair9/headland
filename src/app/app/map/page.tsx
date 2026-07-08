import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'
import { getOrgColors } from '@/lib/org-colors'
import MapShell from '@/components/map/MapShell'

export const metadata: Metadata = { title: 'Block map' }

export default async function MapPage() {
  const { org } = await requireUserAndOrg()
  const [fields, colorOverrides] = await Promise.all([listFields(org.id), getOrgColors(org.id)])

  return (
    <MapShell
      initialFields={fields}
      units={org.units_default}
      state={org.state}
      colorOverrides={colorOverrides}
    />
  )
}
