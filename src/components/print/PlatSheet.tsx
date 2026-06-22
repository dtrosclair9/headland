import { UNSET_RATOON_COLOR } from '@/lib/ratoon-colors'
import { SITE_NAME } from '@/lib/site'
import type { PlantationSvg } from '@/lib/plantation-map-svg'
import AutoPrint from './AutoPrint'

interface LegendItem {
  key: string
  color: string
  label: string
}

// Shared printable plat sheet used by the plantation print and the
// "selected blocks" print. A compact one-line header (title + counts + legend +
// date) keeps the map as large as possible, and the map is height-capped so the
// whole thing always lands on a single landscape page.
export default function PlatSheet({
  orgName,
  title,
  meta,
  svg,
  legendItems,
  hasUnset,
  today,
  unitWord,
  emptyMessage,
}: {
  orgName: string
  title: string
  meta: string
  svg: PlantationSvg | null
  legendItems: LegendItem[]
  hasUnset: boolean
  today: string
  unitWord: string
  emptyMessage: string
}) {
  return (
    <>
      <AutoPrint />

      <style>{`
        @page { size: letter landscape; margin: 0.3in; }
        @media print {
          .no-print { display: none !important; }
          html, body { margin: 0 !important; padding: 0 !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .sheet { padding: 0 !important; box-shadow: none !important; margin: 0 !important; width: 100% !important; }
        }
        @media screen {
          body { background: #f3f4f6; }
          .sheet { box-shadow: 0 0 12px rgba(0,0,0,0.08); margin: 24px auto; }
        }
        .sheet {
          width: 10in;
          padding: 0.35in;
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
        {/* Compact one-line header: title + counts on the left, legend + date on
            the right, so the map gets the rest of the page. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 16,
            marginBottom: 6,
            paddingBottom: 6,
            borderBottom: '1px solid #00000014',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 9, letterSpacing: 1.5, fontWeight: 700, color: '#6B6B6B', margin: 0, textTransform: 'uppercase' }}>
              {orgName}
            </p>
            <h1 style={{ fontSize: 22, color: '#1A3D2E', fontWeight: 700, margin: '1px 0 0' }}>
              {title}
              <span style={{ fontSize: 11, fontWeight: 400, color: '#6B6B6B', marginLeft: 8 }}>{meta}</span>
            </h1>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              fontSize: 10,
              color: '#374151',
            }}
          >
            {legendItems.map((r) => (
              <span key={r.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 11, height: 11, background: r.color, border: '1px solid #00000022', display: 'inline-block' }} />
                {r.label}
              </span>
            ))}
            {hasUnset && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 11, height: 11, background: UNSET_RATOON_COLOR, border: '1px solid #00000022', display: 'inline-block' }} />
                No cut set
              </span>
            )}
            <span style={{ color: '#6B6B6B', marginLeft: 4 }}>
              {today} · {SITE_NAME}
            </span>
          </div>
        </div>

        {svg ? (
          <svg
            viewBox={`0 0 ${svg.width} ${svg.height}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: '100%', height: 'auto', maxHeight: '5.9in', display: 'block', margin: '0 auto' }}
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
                  <text x={b.labelX} y={b.labelY - b.fontSize * 0.35} fontSize={b.fontSize} fontWeight={700} fill="#111827">
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
          <div style={{ padding: 40, textAlign: 'center', color: '#6B6B6B', fontSize: 12 }}>{emptyMessage}</div>
        )}

        <p style={{ fontSize: 8, color: '#9CA3AF', marginTop: 6 }}>
          Acreage shown in {unitWord}. Colored by year cane. {SITE_NAME} · headland.farm
        </p>
      </div>
    </>
  )
}
