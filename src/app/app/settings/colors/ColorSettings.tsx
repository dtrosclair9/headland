'use client'

import { useMemo, useRef, useState } from 'react'
import { RATOON_COLORS } from '@/lib/ratoon-colors'
import { defaultVarietyColors } from '@/lib/variety-colors'
import type { OrgColorOverrides } from '@/lib/org-colors'

// Per-farm color editor. Each row is the built-in default until the farmer
// picks a custom color (native color input = full custom-shade picker, like
// the Office palette dialog). Changes save immediately; Reset returns a row
// to the default.
export default function ColorSettings({
  varieties,
  initialOverrides,
}: {
  varieties: string[]
  initialOverrides: OrgColorOverrides
}) {
  const [overrides, setOverrides] = useState<OrgColorOverrides>(initialOverrides)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // Debounce per key so dragging around the picker doesn't fire a request per pixel.
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const varietyDefaults = useMemo(() => defaultVarietyColors(varieties), [varieties])

  function save(kind: 'stage' | 'variety', key: string, color: string | null) {
    setOverrides((prev) => {
      const next = { ...prev, [kind]: { ...prev[kind] } }
      if (color === null) delete next[kind][key]
      else next[kind][key] = color
      return next
    })
    const tkey = `${kind}:${key}`
    const existing = timers.current.get(tkey)
    if (existing) clearTimeout(existing)
    timers.current.set(
      tkey,
      setTimeout(async () => {
        setStatus('saving')
        try {
          const res = await fetch('/api/colors', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kind, key, color }),
          })
          if (!res.ok) throw new Error('save failed')
          setStatus('saved')
          setTimeout(() => setStatus('idle'), 1500)
        } catch {
          setStatus('error')
        }
      }, 400),
    )
  }

  return (
    <div className="space-y-6">
      <div className="h-5 text-xs font-semibold">
        {status === 'saving' && <span className="text-gray-500">Saving…</span>}
        {status === 'saved' && <span className="text-green-700">Saved ✓</span>}
        {status === 'error' && (
          <span className="text-red-700">Save failed — check your connection and try again.</span>
        )}
      </div>

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="text-base font-bold text-primary mb-1">Year cane</h2>
        <p className="text-xs text-gray-500 mb-4">
          Block colors by cut on the map and the printed crop map.
        </p>
        <ul className="divide-y divide-gray-50">
          {RATOON_COLORS.map((r) => (
            <ColorRow
              key={r.key}
              label={r.label}
              value={overrides.stage[r.key] ?? r.color}
              isCustom={r.key in overrides.stage}
              onChange={(hex) => save('stage', r.key, hex)}
              onReset={() => save('stage', r.key, null)}
            />
          ))}
        </ul>
      </section>

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="text-base font-bold text-primary mb-1">Varieties</h2>
        <p className="text-xs text-gray-500 mb-4">
          Used when the map is colored by variety (Layers tab → Color by → Variety).
        </p>
        {varieties.length === 0 ? (
          <p className="text-sm text-gray-500">
            No varieties on your blocks yet — set a variety on a block and it&apos;ll show up
            here.
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {varieties.map((v) => (
              <ColorRow
                key={v}
                label={v}
                value={overrides.variety[v] ?? varietyDefaults[v] ?? '#6B7280'}
                isCustom={v in overrides.variety}
                onChange={(hex) => save('variety', v, hex)}
                onReset={() => save('variety', v, null)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ColorRow({
  label,
  value,
  isCustom,
  onChange,
  onReset,
}: {
  label: string
  value: string
  isCustom: boolean
  onChange: (hex: string) => void
  onReset: () => void
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
          aria-label={`Color for ${label}`}
        />
        {/* Clicking the label opens the hidden input's native picker. */}
        <span
          className="w-9 h-9 rounded-md border border-gray-300 shadow-sm inline-block"
          style={{ backgroundColor: value }}
        />
      </label>
      <span className="flex-1 text-sm font-medium text-gray-800">{label}</span>
      <span className="text-xs text-gray-400 font-mono">{value.toUpperCase()}</span>
      {isCustom && (
        <button
          type="button"
          onClick={onReset}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Reset
        </button>
      )}
    </li>
  )
}
