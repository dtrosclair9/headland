'use client'

import { useState } from 'react'
import { UNSET_RATOON_COLOR } from '@/lib/ratoon-colors'
import type { StageColor } from '@/lib/resolve-colors'

// The palette legend (Cycle / Variety) — ONE component shared by the full
// Mapbox map and the lite map so the two engines can never drift (the lite
// map shipped without any legend until Lance's side-by-side caught it).
// Collapsible; defaults closed on phones/tablets so it doesn't cover the map,
// open on desktop where there's room.
export default function MapLegend({
  colorBy,
  stageColors,
  varietyColors,
}: {
  colorBy: 'stage' | 'variety'
  stageColors: StageColor[]
  varietyColors: Record<string, string>
}) {
  const [open, setOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 1024,
  )
  return (
    <div className="absolute bottom-8 right-3 z-10 pointer-events-auto">
      {open ? (
        <div className="rounded-md bg-white/95 backdrop-blur shadow-md border border-gray-100 p-3 w-44 max-h-72 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
              {colorBy === 'variety' ? 'Variety' : 'Cycle'}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Hide legend"
              className="text-gray-400 hover:text-gray-700"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <ul className="space-y-1">
            {colorBy === 'variety'
              ? Object.entries(varietyColors).map(([name, color]) => (
                  <li key={name} className="flex items-center gap-2 text-xs text-gray-700">
                    <span
                      className="inline-block w-3.5 h-3.5 rounded border border-gray-300 shadow-sm shrink-0"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{name}</span>
                  </li>
                ))
              : stageColors.map((r) => (
                  <li key={r.key} className="flex items-center gap-2 text-xs text-gray-700">
                    <span
                      className="inline-block w-3.5 h-3.5 rounded border border-gray-300 shadow-sm"
                      style={{ backgroundColor: r.color }}
                      aria-hidden="true"
                    />
                    <span>{r.label}</span>
                  </li>
                ))}
            <li className="flex items-center gap-2 text-xs text-gray-500 pt-1 mt-1 border-t border-gray-100">
              <span
                className="inline-block w-3.5 h-3.5 rounded border border-gray-300 shadow-sm"
                style={{ backgroundColor: UNSET_RATOON_COLOR }}
                aria-hidden="true"
              />
              <span>Not set</span>
            </li>
          </ul>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-white/95 backdrop-blur shadow-md border border-gray-100 px-3 py-2 text-xs font-semibold text-primary hover:bg-white"
        >
          {colorBy === 'variety' ? 'Variety legend' : 'Cycle legend'}
        </button>
      )}
    </div>
  )
}
