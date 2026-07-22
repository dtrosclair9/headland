'use client'

import { useMemo, useRef, useState } from 'react'
import type { FieldRow } from '@/lib/fields'

// No-WebGL fallback map. Old farm-office computers (ancient Chrome, blocked
// GPU drivers, hardware acceleration off) can't create the WebGL2 context
// Mapbox GL v3 requires — but the crop map is a white schematic that needs no
// GPU at all. This renders the same blocks as plain SVG: pan, zoom, tap to
// select. Satellite imagery is the only thing that genuinely needs WebGL.
export default function LiteMap({
  fields,
  selectedFieldId,
  onSelectField,
  stageColorMap,
}: {
  fields: FieldRow[]
  selectedFieldId: string | null
  onSelectField: (id: string) => void
  stageColorMap: Record<string, string>
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  // viewBox state = the camera. Start fitted to the farm.
  const base = useMemo(() => {
    let x1 = Infinity,
      y1 = Infinity,
      x2 = -Infinity,
      y2 = -Infinity
    for (const f of fields) {
      for (const ring of f.geometry?.coordinates ?? []) {
        for (const [lng, lat] of ring) {
          x1 = Math.min(x1, lng)
          x2 = Math.max(x2, lng)
          y1 = Math.min(y1, lat)
          y2 = Math.max(y2, lat)
        }
      }
    }
    if (!Number.isFinite(x1)) return { x: 0, y: 0, w: 1, h: 1, k: 1 }
    // Local equirectangular: scale lng by cos(lat) so shapes keep their
    // true proportions (same projection as the print sheets).
    const k = Math.cos((((y1 + y2) / 2) * Math.PI) / 180)
    const pad = Math.max((x2 - x1) * k, y2 - y1) * 0.06
    return {
      x: x1 * k - pad,
      y: -y2 - pad, // SVG y grows downward; use -lat so north stays up
      w: (x2 - x1) * k + pad * 2,
      h: y2 - y1 + pad * 2,
      k,
    }
  }, [fields])
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const v = view ?? base
  const drag = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null)

  const toPath = (f: FieldRow) =>
    (f.geometry?.coordinates ?? [])
      .map(
        (ring) =>
          'M' + ring.map(([lng, lat]) => `${(lng * base.k).toFixed(6)},${(-lat).toFixed(6)}`).join('L') + 'Z',
      )
      .join(' ')

  // Screen-px → viewBox units.
  const unitsPerPx = () => {
    const el = svgRef.current
    if (!el) return v.w / 800
    const r = el.getBoundingClientRect()
    return v.w / r.width
  }

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const fx = (clientX - r.left) / r.width
    const fy = (clientY - r.top) / r.height
    const w = Math.min(Math.max(v.w * factor, base.w / 200), base.w * 3)
    const h = (w / v.w) * v.h
    setView({ x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy, w, h })
  }

  const zoomLevel = base.w / v.w
  const showLabels = zoomLevel > 3

  return (
    <div className="relative flex-1 h-full bg-white">
      <svg
        ref={svgRef}
        viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
        className="absolute inset-0 w-full h-full touch-none cursor-grab active:cursor-grabbing select-none"
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
        {fields.map((f) => {
          const fill = (f.current_ratoon && stageColorMap[f.current_ratoon]) || '#e5e7eb'
          const sel = f.id === selectedFieldId
          return (
            <path
              key={f.id}
              d={toPath(f)}
              fill={fill}
              fillOpacity={0.9}
              stroke={sel ? '#111827' : '#374151'}
              strokeWidth={(sel ? 2.5 : 0.8) * (v.w / 800)}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                onSelectField(f.id)
              }}
            />
          )
        })}
        {showLabels &&
          fields.map((f) => (
            <text
              key={`t-${f.id}`}
              x={f.centroid_lng * base.k}
              y={-f.centroid_lat}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={v.w / 60}
              fill="#111827"
              fontFamily="system-ui, sans-serif"
              pointerEvents="none"
            >
              {f.name}
            </text>
          ))}
      </svg>

      {/* zoom buttons — wheel-free machines (and touch) need them */}
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

      <div className="absolute left-1/2 -translate-x-1/2 bottom-3 z-10 max-w-md px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 shadow-sm text-center">
        This computer can&apos;t show satellite view (graphics too old) — you&apos;re on the crop
        map, and everything else works. For satellite, update Chrome or turn on hardware
        acceleration.
      </div>
    </div>
  )
}
