import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUserAndOrg } from '@/lib/orgs'
import { countActiveFields } from '@/lib/fields'
import ImportWizard from './ImportWizard'

export const metadata: Metadata = { title: 'Import fields' }

export default async function ImportPage() {
  const { org } = await requireUserAndOrg()
  const existing = await countActiveFields(org.id)

  return (
    <div className="container-wide py-8 max-w-2xl">
      <Link href="/app/map" className="text-sm text-gray-500 hover:text-primary">← Back to map</Link>
      <h1 className="text-2xl font-bold text-primary mt-1 mb-2">Import your fields</h1>
      <p className="text-sm text-gray-600 mb-6">
        Bring your whole operation in at once instead of drawing every field. In your old program
        (FarmWorks, John Deere, Ag Leader…) or from your FSA office, export your fields as a{' '}
        <strong>shapefile</strong> (in FarmWorks it&apos;s <em>Export → ArcView Shape File</em>), then
        upload it here.
      </p>
      <ImportWizard existingCount={existing} />
    </div>
  )
}
