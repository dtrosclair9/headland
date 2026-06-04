import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'
import { formatArea } from '@/lib/units'

export const metadata: Metadata = { title: 'Export' }

export default async function ExportPage() {
  const { org } = await requireUserAndOrg()
  const fields = await listFields(org.id)
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
