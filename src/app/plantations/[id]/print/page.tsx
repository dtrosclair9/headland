import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUserAndOrg } from '@/lib/orgs'
import { getPlantation } from '@/lib/plantations'
import { listFieldsByPlantation } from '@/lib/fields'
import { buildPlantationSvg } from '@/lib/plantation-map-svg'
import { RATOON_COLORS, UNSET_RATOON_COLOR } from '@/lib/ratoon-colors'
import { SITE_NAME } from '@/lib/site'
import AutoPrint from './AutoPrint'

export const metadata: Metadata = { title: 'Print plantation' }

export default async function PlantationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { org } = await requireUserAndOrg()
  const plantation = await getPlantation(id)
  if (!plantation || plantation.org_id !== org.id) notFound()

  const blocks = await listFieldsByPlantation(id)
  const unitsArpents = org.units_default === 'arpents'
  const svg = buildPlantationSvg(blocks, { unitsArpents })

  const totalAcres = blocks.reduce((s, b) => s + Number(b.acreage_cached || 0), 0)
  const totalArpents = blocks.reduce((s, b) => s + Number(b.arpents_cached || 0), 0)
  const totalLabel = unitsArpents
    ? `${totalArpents.toFixed(2)} arp · ${totalAcres.toFixed(2)} ac`
    : `${totalAcres.toFixed(2)} ac · ${totalArpents.toFixed(2)} arp`
  const unitWord = unitsArpents ? 'arpents' : 'acres'

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const legendItems = svg
    ? RATOON_COLORS.filter((r) => svg.stagesPresent.includes(r.key))
    : []

  return (
    <>
      <AutoPrint />

      <style>{`
        @page { size: letter landscape; margin: 0.4in; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @media screen {
          body { background: #f3f4f6; }
          .sheet { box-shadow: 0 0 12px rgba(0,0,0,0.08); margin: 24px auto; }
        }
        .sheet {
          width: 10in;
          padding: 0.4in;
          background: white;
          color: #1f2937;
          font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif;
        }
      `}</style>

      <div className="no-print" style={{ padding: 16, textAlign: 'center', background: '#1A3D2E', color: 'white' }}>
        <p style={{ margin: 0, fontSize: 14 }}>
          Print or save as PDF — File → Print (⌘P) → &quot;Save as PDF&quot;. Landscape.
        </p>
      </div>

      <div className="sheet">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <p style={{ fontSize: 9, letterSpacing: 1.5, fontWeight: 700, color: '#6B6B6B', margin: 0, textTransform: 'uppercase' }}>
              {org.name}
            </p>
            <h1 style={{ fontSize: 26, color: '#1A3D2E', fontWeight: 700, margin: '2px 0' }}>
              {plantation.name}
            </h1>
            <p style={{ fontSize: 11, color: '#6B6B6B', margin: 0 }}>
              {blocks.length} block{blocks.length === 1 ? '' : 's'} · {totalLabel}
              {plantation.fsa_farm_number ? ` · Farm ${plantation.fsa_farm_number}` : ''}
              {plantation.fsa_tract_number ? ` · Tract ${plantation.fsa_tract_number}` : ''}
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: '#6B6B6B' }}>
            <div>{today}</div>
            <div>{SITE_NAME}</div>
          </div>
        </div>

        {/* Legend — only the cuts present in this plantation */}
        {(legendItems.length > 0 || svg?.hasUnset) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
            {legendItems.map((r) => (
              <span key={r.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#374151' }}>
                <span style={{ width: 12, height: 12, background: r.color, border: '1px solid #00000022', display: 'inline-block' }} />
                {r.label}
              </span>
            ))}
            {svg?.hasUnset && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#374151' }}>
                <span style={{ width: 12, height: 12, background: UNSET_RATOON_COLOR, border: '1px solid #00000022', display: 'inline-block' }} />
                No cut set
              </span>
            )}
          </div>
        )}

        {svg ? (
          <svg
            viewBox={`0 0 ${svg.width} ${svg.height}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          >
            {svg.blocks.map((b) => (
              <polygon
                key={b.id}
                points={b.points}
                fill={b.color}
                stroke="#1f2937"
                strokeWidth={0.8}
                strokeLinejoin="round"
              />
            ))}
            {svg.blocks.map((b) => (
              <g key={`l-${b.id}`} textAnchor="middle">
                {b.showName && (
                  <text
                    x={b.labelX}
                    y={b.labelY - b.fontSize * 0.35}
                    fontSize={b.fontSize}
                    fontWeight={700}
                    fill="#111827"
                  >
                    {b.name}
                  </text>
                )}
                <text
                  x={b.labelX}
                  y={b.showName ? b.labelY + b.fontSize * 0.8 : b.labelY + b.fontSize * 0.35}
                  fontSize={b.fontSize}
                  fill="#111827"
                >
                  {b.acreageLabel}
                </text>
              </g>
            ))}
          </svg>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B6B6B', fontSize: 12 }}>
            No blocks in this plantation yet. Assign blocks to it from the map, then print.
          </div>
        )}

        <p style={{ fontSize: 8, color: '#9CA3AF', marginTop: 8 }}>
          Acreage shown in {unitWord}. Colored by year cane. {SITE_NAME} · headland.farm
        </p>
      </div>
    </>
  )
}
