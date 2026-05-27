import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'
import { listDitches } from '@/lib/ditches'
import MapShell from '@/components/map/MapShell'

export const metadata: Metadata = { title: 'Block map' }

export default async function MapPage() {
  const { org } = await requireUserAndOrg()
  const [fields, ditches] = await Promise.all([listFields(org.id), listDitches(org.id)])

  return (
    <MapShell
      initialFields={fields}
      initialDitches={ditches}
      units={org.units_default}
      state={org.state}
    />
  )
}
