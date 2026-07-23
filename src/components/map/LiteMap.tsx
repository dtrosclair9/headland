'use client'

import { useMemo, useRef, useState } from 'react'
import type { FieldRow } from '@/lib/fields'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

// ── Web Mercator world space ────────────────────────────────────────────
// Everything (polygons AND raster tiles) lives in mercator "world units"
// (0..1 across the globe), so satellite tiles align with block geometry by
// construction — the same trick Leaflet/FarmMind use, which is why their
// maps run on ancient computers: image tiles need no GPU.
const mx = (lng: number) => (lng + 180) / 360
const my = (lat: number) => {
  const s = Math.sin((lat * Math.PI) / 180)
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
}

// No-WebGL fallback map. Old farm-office computers (out-of-date Chrome,
// blocked GPU drivers, acceleration off) can't create the WebGL2 context
// Mapbox GL v3 requires. This renders the same farm as plain SVG + raster
// satellite tiles: pan, zoom, tap to select — no GPU anywhere.
export default function LiteMap({
  fields,
  selectedFieldId,
  onSelectField,
  stageColorMap,
  colorBy = 'stage',
  varietyColors = {},
  highlightColor = null,
  filterIds = null,
  visibleIds = null,
  whiteMap = false,
}: {
  fields: FieldRow[]
  selectedFieldId: string | null
  onSelectField: (id: string) => void
  stageColorMap: Record<string, string>
  /** stage = year-cane colors, variety = variety palette (mirrors the full map) */
  colorBy?: 'stage' | 'variety'
  varietyColors?: Record<string, string>
  /** fly-plan viewing: paint matching blocks this one color */
  highlightColor?: string | null
  /** layer highlight: blocks outside the set render white, labels kept */
  filterIds?: Set<string> | null
  /** plantation scoping: blocks outside are omitted entirely */
  visibleIds?: Set<string> | null
  /** pilot map: everything white */
  whiteMap?: boolean
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [mode, setMode] = useState<'crop' | 'satellite'>('crop')

  const base = useMemo(() => {
    let x1 = Infinity,
      y1 = Infinity,
      x2 = -Infinity,
      y2 = -Infinity
    for (const f of fields) {
      for (const ring of f.geometry?.coordinates ?? []) {
        for (const [lng, lat] of ring) {
          x1 = Math.min(x1, mx(lng))
          x2 = Math.max(x2, mx(lng))
          y1 = Math.min(y1, my(lat))
          y2 = Math.max(y2, my(lat))
        }
      }
    }
    if (!Number.isFinite(x1)) {
      // Empty farm: frame south Louisiana rather than a zero-size box.
      const cx = mx(-90.8)
      const cy = my(29.9)
      return { x: cx - 0.001, y: cy - 0.0007, w: 0.002, h: 0.0014 }
    }
    const pad = Math.max(x2 - x1, y2 - y1) * 0.06 || 0.0005
    return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 }
  }, [fields])
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const v = view ?? base
  const drag = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null)

  const pathFor = (f: FieldRow) =>
    (f.geometry?.coordinates ?? [])
      .map(
        (ring) =>
          'M' + ring.map(([lng, lat]) => `${mx(lng).toFixed(8)},${my(lat).toFixed(8)}`).join('L') + 'Z',
      )
      .join(' ')
  // Path data is zoom-independent — cache it per block.
  const blockPaths = useMemo(
    () => new Map(fields.map((f) => [f.id, pathFor(f)])),
    [fields],
  )

  const containerWidthPx = () => svgRef.current?.getBoundingClientRect().width ?? 800

  // Visible satellite tiles for the current view. Tile z chosen so one 256px
  // (logical) tile ≈ 256 screen px; capped to Mapbox's max and a sane count.
  const tiles = useMemo(() => {
    if (mode !== 'satellite' || !MAPBOX_TOKEN) return []
    const width = typeof window !== 'undefined' ? containerWidthPx() : 800
    let z = Math.round(Math.log2(width / (256 * v.w)))
    z = Math.max(1, Math.min(19, z))
    let n = 2 ** z
    // widen z down if the viewport would need too many tiles
    while (z > 1 && (v.w * n + 2) * (v.h * n + 2) > 80) {
      z--
      n = 2 ** z
    }
    const x0 = Math.max(0, Math.floor(v.x * n))
    const x1 = Math.min(n - 1, Math.floor((v.x + v.w) * n))
    const y0 = Math.max(0, Math.floor(v.y * n))
    const y1 = Math.min(n - 1, Math.floor((v.y + v.h) * n))
    const out: { key: string; url: string; x: number; y: number; s: number }[] = []
    for (let tx = x0; tx <= x1; tx++)
      for (let ty = y0; ty <= y1; ty++)
        out.push({
          key: `${z}/${tx}/${ty}`,
          url: `https://api.mapbox.com/v4/mapbox.satellite/${z}/${tx}/${ty}@2x.jpg90?access_token=${MAPBOX_TOKEN}`,
          x: tx / n,
          y: ty / n,
          s: 1 / n,
        })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, v.x, v.y, v.w, v.h])

  const unitsPerPx = () => v.w / containerWidthPx()

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const fx = (clientX - r.left) / r.width
    const fy = (clientY - r.top) / r.height
    const w = Math.min(Math.max(v.w * factor, base.w / 400), base.w * 6)
    const h = (w / v.w) * v.h
    setView({ x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy, w, h })
  }

  const zoomLevel = base.w / v.w
  const showLabels = zoomLevel > 3
  const sat = mode === 'satellite'
  const shown = visibleIds ? fields.filter((f) => visibleIds.has(f.id)) : fields
  // Mirrors the full map's fillColorExpression: selected > plain/white >
  // fly-plan color > variety palette > stage palette.
  const fillFor = (f: FieldRow): string => {
    if (f.id === selectedFieldId) return '#E8A33D'
    if (whiteMap || (filterIds && !filterIds.has(f.id))) return '#FFFFFF'
    if (highlightColor) return highlightColor
    if (colorBy === 'variety') return varietyColors[f.variety ?? ''] ?? '#e5e7eb'
    return (f.current_ratoon && stageColorMap[f.current_ratoon]) || '#e5e7eb'
  }

  return (
    <div className="relative flex-1 h-full bg-white">
      <svg
        ref={svgRef}
        viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full touch-none cursor-grab active:cursor-grabbing select-none"
        style={{ backgroundColor: sat ? '#0b1220' : '#FFFFFF' }}
        onWheel={(e) => zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.15 : 0.87)}
        onPointerDown={(e) => {
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
          drag.current = { px: e.clientX, py: e.clientY, vx: v.x, vy: v.y }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const u = unitsPerPx()
          setView({
            ...v,
            x: drag.current.vx - (e.clientX - drag.current.px) * u,
            y: drag.current.vy - (e.clientY - drag.current.py) * u,
          })
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {sat &&
          tiles.map((t) => (
            <image
              key={t.key}
              href={t.url}
              x={t.x}
              y={t.y}
              width={t.s}
              height={t.s}
              preserveAspectRatio="none"
            />
          ))}
        {shown.map((f) => {
          const sel = f.id === selectedFieldId
          return (
            <path
              key={f.id}
              d={blockPaths.get(f.id) ?? ''}
              fill={sat ? 'transparent' : fillFor(f)}
              fillOpacity={sat ? 0 : 0.9}
              stroke={sel ? (sat ? '#38bdf8' : '#111827') : sat ? '#facc15' : '#374151'}
              strokeWidth={(sel ? 2.5 : sat ? 1.2 : 0.8) * (v.w / 800)}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                onSelectField(f.id)
              }}
            />
          )
        })}
        {showLabels &&
          shown.map((f) => (
            <text
              key={`t-${f.id}`}
              x={mx(f.centroid_lng)}
              y={my(f.centroid_lat)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={v.w / 60}
              fill={sat ? '#ffffff' : '#111827'}
              stroke={sat ? 'rgba(0,0,0,0.6)' : 'none'}
              strokeWidth={sat ? v.w / 1200 : 0}
              paintOrder="stroke"
              fontFamily="system-ui, sans-serif"
              pointerEvents="none"
            >
              {f.name}
            </text>
          ))}
      </svg>

      {/* view toggle — same two modes as the full map */}
      <div className="absolute left-1/2 -translate-x-1/2 z-10 bottom-8 lg:bottom-auto lg:top-3">
        <div className="inline-flex rounded-md bg-white shadow-md border border-gray-200 overflow-hidden text-sm font-semibold">
          <button
            type="button"
            onClick={() => setMode('crop')}
            className={`px-3 py-2 transition ${mode === 'crop' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Crop map
          </button>
          <button
            type="button"
            onClick={() => setMode('satellite')}
            className={`px-3 py-2 transition border-l border-gray-200 ${sat ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Satellite
          </button>
        </div>
      </div>

      <div className="absolute right-3 top-3 z-10 flex flex-col rounded-md bg-white shadow-md border border-gray-200 overflow-hidden">
        {[
          ['+', 0.7],
          ['−', 1.45],
        ].map(([label, factor]) => (
          <button
            key={label as string}
            type="button"
            className="w-9 h-9 text-lg font-bold text-gray-700 hover:bg-gray-50 border-b last:border-b-0 border-gray-200"
            onClick={() => {
              const el = svgRef.current
              if (!el) return
              const r = el.getBoundingClientRect()
              zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor as number)
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 bottom-20 lg:bottom-3 lg:left-auto lg:right-3 lg:translate-x-0 z-10 max-w-xs px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 shadow-sm text-center">
        Compatibility mode — this computer&apos;s graphics can&apos;t run the full map, so
        you&apos;re on the lightweight version. Everything still works.
      </div>
    </div>
  )
}
