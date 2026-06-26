import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'
import { formatArea } from '@/lib/units'
import { listSnapshots } from '@/lib/snapshots'
import SnapshotButton from './SnapshotButton'

export const metadata: Metadata = { title: 'Export' }

function periodLabel(period: string) {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default async function ExportPage() {
  const { org } = await requireUserAndOrg()
  const [fields, snapshots] = await Promise.all([
    listFields(org.id),
    listSnapshots(org.id),
  ])
  const totalAcres = fields.reduce(
    (sum, f) => sum + Number(f.acreage_cached || 0),
    0,
  )
  const total = formatArea(totalAcres, org.units_default)
  const empty = fields.length === 0

  return (
    <div className="container-wide py-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-primary mb-2">Export</h1>
      <p className="text-sm text-gray-600 mb-6">
        Download every block in <strong>{org.name}</strong>. {empty ? (
          <>You don&apos;t have any blocks yet.</>
        ) : (
          <>
            {fields.length} block{fields.length === 1 ? '' : 's'} ·{' '}
            {total.primary} <span className="text-gray-400">· {total.alt}</span>
          </>
        )}
      </p>

      <p className="text-sm font-semibold text-primary mb-3">For FSA acreage reporting</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ExportCard
          title="FSA shapefile"
          description="The Esri shapefile bundle for FSA-578 acreage reporting — every block, with acreage."
          note="Esri shapefile (.shp/.shx/.dbf/.prj), NAD83."
          href="/api/export/shapefile"
          buttonLabel="Download"
          disabled={empty}
        />
        <ExportCard
          title="Google Earth (KML)"
          description="The same blocks as a Google Earth file. Some FSA offices import this more reliably than a shapefile."
          note="Opens in Google Earth; one placemark per block."
          href="/api/export/kml"
          buttonLabel="Download"
          disabled={empty}
        />
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Not sure which your FSA office takes? Send both and ask which one worked.
      </p>

      <p className="mt-6 text-xs text-gray-500">
        Need a printed pack? Open each block and click <strong>Print</strong> — your browser handles
        the PDF save or sends it to a printer. Bulk print pack coming back as an HTML page.
      </p>

      <div className="mt-8 border-t border-gray-100 pt-6">
        <h2 className="text-lg font-bold text-primary mb-1">Monthly archive</h2>
        <p className="text-sm text-gray-600 mb-4">
          A dated backup of your whole farm, saved automatically on the 1st of each month. Download any month, any year.
        </p>
        <SnapshotButton />
        {snapshots.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            Your first snapshot is created automatically on the 1st — or make one now.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {snapshots.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  <span className="font-semibold text-primary">
                    {periodLabel(s.period)}
                  </span>
                  <span className="text-gray-500">
                    {' '}· {s.block_count} block{s.block_count === 1 ? '' : 's'} · {Number(s.acreage).toLocaleString()} ac
                  </span>
                </span>
                <a
                  href={`/api/snapshots/${s.id}/download`}
                  className="font-semibold text-primary hover:underline"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ExportCard({
  title,
  description,
  note,
  href,
  buttonLabel,
  disabled,
}: {
  title: string
  description: string
  note?: string
  href: string
  buttonLabel: string
  disabled: boolean
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 flex flex-col">
      <h2 className="text-base font-bold text-primary mb-1">{title}</h2>
      <p className="text-sm text-gray-600 leading-relaxed flex-1">{description}</p>
      {note && <p className="mt-2 text-xs text-gray-400">{note}</p>}
      {disabled ? (
        <button
          type="button"
          disabled
          className="btn-primary text-sm mt-4 opacity-50 cursor-not-allowed"
        >
          {buttonLabel}
        </button>
      ) : (
        <a href={href} className="btn-primary text-sm mt-4 text-center">
          {buttonLabel}
        </a>
      )}
    </div>
  )
}
