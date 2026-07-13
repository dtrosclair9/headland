import { UNSET_RATOON_COLOR } from '@/lib/ratoon-colors'
import { paperSpec, type PlantationSvg, type PaperSize } from '@/lib/plantation-map-svg'
import type { LabelField } from '@/lib/label-fields'
import AutoPrint from './AutoPrint'
import LabelFieldToggles from './LabelFieldToggles'
import PaperToggle from './PaperToggle'
import SaveDefaultsButton from './SaveDefaultsButton'
import PrintNow from './PrintNow'

interface LegendItem {
  key: string
  color: string
  label: string
}

// One printable page: its own title, counts, legend, and map.
export interface SheetData {
  title: string
  meta: string
  svg: PlantationSvg | null
  legendItems: LegendItem[]
  hasUnset: boolean
}

// Shared printable plat output. Renders ONE PAGE PER SHEET — multi-plantation
// prints pass one sheet per plantation, and each lands on its own landscape
// page (break-after). A compact one-line header keeps the map as large as
// possible; the map is height-capped so a sheet never spills onto two pages.
export default function PlatSheet({
  orgName,
  sheets,
  today,
  unitWord,
  emptyMessage,
  style = 'crop',
  activeLabelFields,
  paper = 'letter',
  autoPrint = true,
  record,
  bannerExtra,
}: {
  orgName: string
  sheets: SheetData[]
  today: string
  unitWord: string
  emptyMessage: string
  /** which block facts are printing (renders the banner toggles) */
  activeLabelFields?: LabelField[]
  /** paper the sheet is laid out for */
  paper?: PaperSize
  /** open the print dialog on load (off for reference/record views) */
  autoPrint?: boolean
  /**
   * Record-document details printed on EVERY page under the title line:
   * `line` = kind · date/time accomplished · weather · burn category;
   * `notes` = the operator's notes (already in the chosen language).
   */
  record?: { line: string; notes?: string | null }
  /** extra banner controls (language toggle, print button, …) */
  bannerExtra?: React.ReactNode
  // 'spray' = black-and-white outline sheet for sprayer pilots (white fill, heavy
  // black boundaries). 'crop' = colored plat map.
  style?: 'crop' | 'spray'
}) {
  const isSpray = style === 'spray'
  const pages = sheets.filter((s) => s.svg !== null)
  const spec = paperSpec(paper)
  return (
    <>
      {autoPrint && <AutoPrint />}

      <style>{`
        @page { size: ${spec.pageW}in ${spec.pageH}in; margin: 0.3in; }
        @media print {
          .no-print { display: none !important; }
          html, body { margin: 0 !important; padding: 0 !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .sheet { padding: 0 !important; box-shadow: none !important; margin: 0 !important; width: 100% !important; break-after: page; }
          .sheet:last-of-type { break-after: auto; }
        }
        @media screen {
          body { background: #f3f4f6; }
          .sheet { box-shadow: 0 0 12px rgba(0,0,0,0.08); margin: 24px auto; }
        }
        .sheet {
          width: ${spec.sheetWidthIn}in;
          padding: 0.12in 0.15in;
          background: white;
          color: #1f2937;
          font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif;
        }
      `}</style>

      <div className="no-print" style={{ padding: 16, textAlign: 'center', background: '#1A3D2E', color: 'white' }}>
        <p style={{ margin: 0, fontSize: 14 }}>
          {pages.length > 1 ? `${pages.length} pages — one per plantation.` : ''}
          {activeLabelFields && <LabelFieldToggles active={activeLabelFields} />}
          {activeLabelFields && <PaperToggle active={paper} />}
          {activeLabelFields && <SaveDefaultsButton fields={activeLabelFields} />}
          {bannerExtra}
          <PrintNow autoPrintsOnLoad={autoPrint} />
        </p>
      </div>

      {pages.length === 0 && (
        <div className="sheet">
          <div style={{ padding: 40, textAlign: 'center', color: '#6B6B6B', fontSize: 12 }}>{emptyMessage}</div>
        </div>
      )}

      {pages.map((sheet, si) => (
        <div className="sheet" key={si}>
          {/* ONE thin header line — every point of height here is map we
              can't give the blocks. Title, counts, legend, date, brand. */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 3,
              paddingBottom: 3,
              borderBottom: '1px solid #00000014',
            }}
          >
            <div style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <span style={{ fontSize: 14, color: '#1A3D2E', fontWeight: 700 }}>{sheet.title}</span>
              <span style={{ fontSize: 9.5, color: '#6B6B6B', marginLeft: 8 }}>
                {orgName} · {sheet.meta}
                {unitWord === 'arpents' ? ' · acreage in arpents' : ''}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'flex-end',
                fontSize: 9,
                color: '#374151',
                whiteSpace: 'nowrap',
              }}
            >
              {sheet.legendItems.map((r) => (
                <span key={r.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 9, height: 9, background: r.color, border: '1px solid #00000022', display: 'inline-block' }} />
                  {r.label}
                </span>
              ))}
              {!isSpray && sheet.hasUnset && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 9, height: 9, background: UNSET_RATOON_COLOR, border: '1px solid #00000022', display: 'inline-block' }} />
                  No cut set
                </span>
              )}
              <span style={{ color: '#6B6B6B' }}>{today}</span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 15,
                  height: 15,
                  background: '#143324',
                  borderRadius: 3,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- print sheet */}
                <img
                  src="/images/headland-logo-kit/svg/mark-white.svg"
                  alt="Headland"
                  style={{ height: 10, width: 10 }}
                />
              </span>
              <span style={{ fontSize: 7.5, color: '#9CA3AF' }}>headlandmaps.com</span>
            </div>
          </div>
          {record && (
            <div style={{ marginBottom: 2 }}>
              <div style={{ fontSize: 10, color: '#374151' }}>{record.line}</div>
              {record.notes && (
                <div style={{ fontSize: 9.5, color: '#6B7280' }}>{record.notes}</div>
              )}
            </div>
          )}

          <svg
            viewBox={`0 0 ${sheet.svg!.width} ${sheet.svg!.height}`}
            preserveAspectRatio="xMidYMid meet"
            style={{
              width: '100%',
              height: 'auto',
              maxHeight: `${spec.heightIn - (record ? (record.notes ? 0.3 : 0.18) : 0)}in`,
              display: 'block',
              margin: '0 auto',
            }}
          >
            {sheet.svg!.blocks.map((b) => (
              <polygon
                key={b.id}
                points={b.points}
                fill={b.color}
                stroke={isSpray ? '#000000' : '#1f2937'}
                strokeWidth={isSpray ? 1.2 : 0.8}
                strokeLinejoin="round"
              />
            ))}
            {/* Hand-drawn reference lines + text labels — printed in solid
                black on the spray sheet (it's a B&W handout), in their chosen
                color on the crop map. Drawn under the block labels. */}
            {sheet.svg!.annotations.map((a, i) =>
              a.kind === 'line' ? (
                <polyline
                  key={`a-${i}`}
                  points={a.points}
                  fill="none"
                  stroke={isSpray ? '#000000' : a.color}
                  strokeWidth={a.width ?? 2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <text
                  key={`a-${i}`}
                  x={a.x}
                  y={a.y}
                  textAnchor="middle"
                  fontSize={a.size ?? 13}
                  fontWeight={700}
                  fill={isSpray ? '#000000' : a.color}
                  stroke="#FFFFFF"
                  strokeWidth={2.5}
                  paintOrder="stroke"
                  transform={a.rotation ? `rotate(${a.rotation} ${a.x} ${a.y})` : undefined}
                >
                  {a.text}
                </text>
              ),
            )}
            {sheet.svg!.blocks.map((b) => (
              // Per-block: dark text on white/uncolored fills, white text with
              // a thin dark outline on colored fills. A highlight sheet mixes
              // both on the same page.
              <g key={`l-${b.id}`} fill={b.labelDark ? '#111827' : '#FFFFFF'}>
                {b.labels.map((l, i) => (
                  <text
                    key={i}
                    x={l.x}
                    y={l.y}
                    textAnchor={l.anchor}
                    dominantBaseline="central"
                    fontSize={l.font}
                    fontWeight={l.bold ? 700 : 400}
                    transform={l.rotation ? `rotate(${l.rotation} ${l.x} ${l.y})` : undefined}
                    {...(b.labelDark
                      ? {}
                      : { stroke: '#1f2937', strokeWidth: l.font * 0.14, paintOrder: 'stroke' as const })}
                  >
                    {l.text}
                  </text>
                ))}
              </g>
            ))}
            {/* Leader-line callouts: facts for blocks too small to hold them,
                on a white chip in open canvas with a line into the block —
                the plat-map treatment for sliver parcels. */}
            {sheet.svg!.callouts.map((c, i) => (
              <g key={`c-${i}`}>
                <line x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke="#374151" strokeWidth={0.9} />
                <circle cx={c.x1} cy={c.y1} r={1.5} fill="#374151" />
                <rect
                  x={c.box.x}
                  y={c.box.y}
                  width={c.box.w}
                  height={c.box.h}
                  rx={2}
                  fill="#FFFFFF"
                  stroke="#6B7280"
                  strokeWidth={0.5}
                />
                <text
                  x={c.box.x + c.box.w / 2}
                  y={c.box.y + c.box.h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={c.font}
                  fill="#111827"
                >
                  {c.bold && <tspan fontWeight={700}>{c.bold} </tspan>}
                  {c.text}
                </text>
              </g>
            ))}
          </svg>
        </div>
      ))}
    </>
  )
}
