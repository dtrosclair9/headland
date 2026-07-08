import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUserAndOrg } from '@/lib/orgs'
import { getOrgColors } from '@/lib/org-colors'
import { getField } from '@/lib/fields'
import { listHarvests, listRecentApplications } from '@/lib/records'
import { buildPlantationSvg } from '@/lib/plantation-map-svg'
import { acresToArpents } from '@/lib/units'
import { OPERATION_TYPE_LABEL } from '@/lib/records'
import { SITE_NAME } from '@/lib/site'
import AutoPrint from './AutoPrint'

export const metadata: Metadata = { title: 'Print' }

const RATOON_LABELS: Record<string, string> = {
  plant_cane: 'Plant cane',
  first_stubble: '1st stubble',
  second_stubble: '2nd stubble',
  third_stubble: '3rd stubble',
  fourth_stubble: '4th stubble',
  fifth_stubble_plus: '5th stubble',
  sixth_stubble_plus: '6th+ stubble',
  fallow: 'Fallow',
}

export default async function FieldPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { org } = await requireUserAndOrg()
  const field = await getField(id)
  if (!field || field.org_id !== org.id) notFound()

  const [recentHarvests, recentApplications] = await Promise.all([
    listHarvests(id),
    listRecentApplications(id, 5),
  ])

  const acres = Number(field.acreage_cached || 0)
  const arpents = acresToArpents(acres)
  const primary =
    org.units_default === 'arpents'
      ? `${arpents.toFixed(2)} arp`
      : `${acres.toFixed(2)} ac`
  const alt =
    org.units_default === 'arpents'
      ? `${acres.toFixed(2)} ac`
      : `${arpents.toFixed(2)} arp`
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const ratoon = field.current_ratoon
    ? RATOON_LABELS[field.current_ratoon] ?? field.current_ratoon
    : '—'
  const plantDate = field.plant_date
    ? new Date(field.plant_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '—'
  const colorOverrides = await getOrgColors(org.id)
  const svg = buildPlantationSvg([field], {
    unitsArpents: org.units_default === 'arpents',
    stageColors: colorOverrides.stage,
  })

  return (
    <>
      <AutoPrint />

      {/* Print-specific styles: hide chrome, force letter portrait, color print. */}
      <style>{`
        @page { size: letter portrait; margin: 0.5in; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @media screen {
          body { background: #f3f4f6; }
          .sheet { box-shadow: 0 0 12px rgba(0,0,0,0.08); margin: 24px auto; }
        }
        .sheet {
          width: 7.5in;
          padding: 0.5in;
          background: white;
          color: #222;
          font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif;
          font-size: 11pt;
        }
      `}</style>

      <div className="no-print" style={{ padding: 16, textAlign: 'center', background: '#1A3D2E', color: 'white' }}>
        <p style={{ margin: 0, fontSize: 14 }}>
          Print or save as PDF — File → Print (⌘P) → &quot;Save as PDF&quot; in destination dropdown.
        </p>
      </div>

      <div className="sheet">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <p style={{ fontSize: 9, letterSpacing: 1.5, fontWeight: 700, color: '#6B6B6B', margin: 0, textTransform: 'uppercase' }}>
              {SITE_NAME} · {org.name}
            </p>
            <h1 style={{ fontSize: 24, color: '#1A3D2E', fontWeight: 700, margin: '2px 0 2px 0' }}>
              {field.name}
            </h1>
            <p style={{ fontSize: 11, color: '#6B6B6B', margin: 0 }}>
              {primary} · {alt}
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: '#6B6B6B' }}>
            <div>{today}</div>
            <div>GPS {field.centroid_lat.toFixed(5)}°, {field.centroid_lng.toFixed(5)}°</div>
          </div>
        </div>

        <div style={{ height: 2, background: '#1A3D2E', marginBottom: 14 }} />

        {svg ? (
          <svg
            viewBox={`0 0 ${svg.width} ${svg.height}`}
            style={{ width: '100%', height: 'auto', maxHeight: 300, display: 'block', marginBottom: 14, border: '1px solid #E5E7EB', borderRadius: 4 }}
          >
            {svg.blocks.map((b) => (
              <polygon key={b.id} points={b.points} fill={b.color} stroke="#1f2937" strokeWidth={0.8} strokeLinejoin="round" />
            ))}
            {svg.blocks.map((b) => (
              <text key={`l-${b.id}`} x={b.labelX} y={b.labelY} textAnchor="middle" fontSize={b.fontSize} fill="#111827">
                {b.acreageLabel}
              </text>
            ))}
          </svg>
        ) : (
          <div style={{ width: '100%', height: 280, border: '1px solid #D9D9D9', borderRadius: 4, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6B6B', fontSize: 10 }}>
            No boundary to draw.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '0.5px solid #D9D9D9', borderRight: 'none', borderBottom: 'none', marginBottom: 14 }}>
          <MetaCell label="Variety" value={field.variety || '—'} />
          <MetaCell label="Cut / ratoon" value={ratoon} />
          <MetaCell label="Plant date" value={plantDate} />
          <MetaCell label="Acreage" value={primary} />
        </div>

        {recentHarvests.length > 0 && (
          <>
            <PlantationLabel>Recent harvests</PlantationLabel>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th style={{ width: '15%' }}>Year</Th>
                  <Th style={{ width: '20%' }}>Tons</Th>
                  <Th style={{ width: '20%' }}>T/ac</Th>
                  <Th style={{ width: '45%' }}>Notes</Th>
                </tr>
              </thead>
              <tbody>
                {recentHarvests.slice(0, 5).map((h) => (
                  <tr key={h.id}>
                    <Td>{h.harvest_year}</Td>
                    <Td>{h.tons_total ?? '—'}</Td>
                    <Td>{h.tons_per_acre ?? '—'}</Td>
                    <Td>{h.notes ?? ''}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {recentApplications.length > 0 && (
          <>
            <PlantationLabel>Recent operations</PlantationLabel>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th style={{ width: '16%' }}>Date</Th>
                  <Th style={{ width: '20%' }}>Type</Th>
                  <Th style={{ width: '26%' }}>Product</Th>
                  <Th style={{ width: '13%' }}>Rate</Th>
                  <Th style={{ width: '13%' }}>Wind</Th>
                  <Th style={{ width: '12%' }}>Notes</Th>
                </tr>
              </thead>
              <tbody>
                {recentApplications.slice(0, 5).map((a) => (
                  <tr key={a.id}>
                    <Td>{a.applied_at}</Td>
                    <Td>{OPERATION_TYPE_LABEL[a.type] ?? a.type}</Td>
                    <Td>{a.product ?? '—'}</Td>
                    <Td>{a.rate != null ? `${a.rate}${a.unit ? ' ' + a.unit : ''}` : '—'}</Td>
                    <Td>
                      {a.wind_direction || a.wind_speed_mph != null
                        ? `${a.wind_direction ?? ''}${a.wind_speed_mph != null ? ` ${a.wind_speed_mph}` : ''}`.trim()
                        : '—'}
                    </Td>
                    <Td>{a.notes ?? ''}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <PlantationLabel>Notes</PlantationLabel>
        <div style={{ border: '0.75px solid #D9D9D9', borderRadius: 4, minHeight: 120, padding: 12, marginBottom: 12, fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {field.notes ?? ''}
        </div>

        <div style={{ position: 'absolute', bottom: 24, left: 36, right: 36, display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#6B6B6B', paddingTop: 6, borderTop: '0.5px solid #D9D9D9' }}>
          <span>{org.name} · {field.name}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
<span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 13,
              height: 13,
              background: '#143324',
              borderRadius: 3,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- print sheet */}
            <img
              src="/images/headland-logo-kit/svg/mark-white.svg"
              alt="Headland"
              style={{ height: 9, width: 9 }}
            />
          </span>
            headlandmaps.com
          </span>
        </div>
      </div>
    </>
  )
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 8, borderRight: '0.5px solid #D9D9D9', borderBottom: '0.5px solid #D9D9D9' }}>
      <p style={{ fontSize: 8, color: '#6B6B6B', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, margin: 0, marginBottom: 2 }}>
        {label}
      </p>
      <p style={{ fontSize: 11, color: '#222', margin: 0 }}>{value}</p>
    </div>
  )
}

function PlantationLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 9, letterSpacing: 1.5, fontWeight: 700, color: '#6B6B6B', margin: '10px 0 5px 0', textTransform: 'uppercase' }}>
      {children}
    </p>
  )
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  border: '0.5px solid #D9D9D9',
  marginBottom: 10,
  fontSize: 10,
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th style={{ fontSize: 8, color: '#6B6B6B', padding: 5, fontWeight: 700, border: '0.5px solid #D9D9D9', background: '#FAFAFA', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', ...style }}>
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ fontSize: 10, padding: 5, border: '0.5px solid #D9D9D9' }}>
      {children}
    </td>
  )
}
