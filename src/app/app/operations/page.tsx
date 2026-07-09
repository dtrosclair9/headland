import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { listOperations } from '@/lib/operations'
import OperationsFeed from './OperationsFeed'
import PrintButton from './PrintButton'

export const metadata: Metadata = { title: 'Operations' }

// Farm-wide operations hub: every to-do, spray/field op, harvest, scouting
// note, and rotation across every block in one place — open to-dos pinned on
// top, history grouped by month (the FarmWorks "March 2026" folder model,
// minus the files). With 1,000 blocks nobody remembers which ones to open.
export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>
}) {
  const { org } = await requireUserAndOrg()
  const { months: monthsRaw } = await searchParams
  const months = Math.min(Math.max(parseInt(monthsRaw ?? '12', 10) || 12, 1), 120)
  const data = await listOperations(org.id, months)

  return (
    <div className="container-wide py-8">
      <div className="mb-6 flex items-start justify-between gap-4 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-primary">Operations</h1>
          <p className="text-sm text-gray-600 mt-1">
            Everything happening across the farm — to-dos, sprays and field work, harvests,
            scouting, and rotations — without opening blocks one at a time.
          </p>
        </div>
        <PrintButton />
      </div>
      <OperationsFeed
        openTodos={data.openTodos}
        history={data.history}
        hasOlder={data.hasOlder}
        months={months}
      />
    </div>
  )
}
