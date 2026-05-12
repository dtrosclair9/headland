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
        Download every field in <strong>{org.name}</strong>. {empty ? (
          <>You don&apos;t have any fields yet.</>
        ) : (
          <>
            {fields.length} field{fields.length === 1 ? '' : 's'} ·{' '}
            {total.primary} <span className="text-gray-400">· {total.alt}</span>
          </>
        )}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ExportCard
          title="Print pack (PDF)"
          description="Cover sheet + one page per field with satellite, metadata, recent harvests + operations, and a notes box. Hand a stack to the crew before grinding."
          href="/api/export/pdf"
          buttonLabel="Download PDF"
          disabled={empty}
        />
        <ExportCard
          title="GeoJSON"
          description="Field boundaries with all attributes. Re-import into QGIS, ArcGIS, or any modern GIS. Standard EPSG:4326."
          href="/api/export/geojson"
          buttonLabel="Download .geojson"
          disabled={empty}
        />
        <ExportCard
          title="KML"
          description="Open in Google Earth or pass to crop insurance / FSA. One placemark per field with name, variety, cut, and acreage in the description."
          href="/api/export/kml"
          buttonLabel="Download .kml"
          disabled={empty}
        />
      </div>
    </div>
  )
}

function ExportCard({
  title,
  description,
  href,
  buttonLabel,
  disabled,
}: {
  title: string
  description: string
  href: string
  buttonLabel: string
  disabled: boolean
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 flex flex-col">
      <h2 className="text-base font-bold text-primary mb-1">{title}</h2>
      <p className="text-sm text-gray-600 leading-relaxed flex-1">{description}</p>
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
