'use client'

import { useState } from 'react'
import { ALL_LABEL_FIELDS, LABEL_FIELD_NAMES, type LabelField } from '@/lib/label-fields'

export default function MapLabelSettings({
  initialFields,
  initialColorBy,
}: {
  initialFields: LabelField[]
  initialColorBy: 'stage' | 'variety'
}) {
  const [fields, setFields] = useState<Set<LabelField>>(new Set(initialFields))
  const [colorBy, setColorBy] = useState<'stage' | 'variety'>(initialColorBy)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const toggle = (f: LabelField) => {
    const next = new Set(fields)
    if (next.has(f)) next.delete(f)
    else next.add(f)
    setFields(next)
    setSaved(false)
  }

  const save = async () => {
    if (fields.size === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/view-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: [...fields], colorBy }),
      })
      if (res.ok) setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
          Labels shown on blocks
        </p>
        <div className="grid grid-cols-2 gap-2">
          {ALL_LABEL_FIELDS.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={fields.has(f)}
                onChange={() => toggle(f)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              {LABEL_FIELD_NAMES[f]}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
          Color blocks by
        </p>
        <div className="flex gap-4">
          {(
            [
              ['stage', 'Year cane'],
              ['variety', 'Variety'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="default-color-by"
                checked={colorBy === key}
                onChange={() => {
                  setColorBy(key)
                  setSaved(false)
                }}
                className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || fields.size === 0}
          className="text-sm font-semibold rounded-md border-2 border-primary text-primary px-4 py-1.5 hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save default'}
        </button>
        {fields.size === 0 && <span className="text-xs text-gray-500">Pick at least one label.</span>}
        {saved && <span className="text-xs text-green-600 font-medium">Saved</span>}
      </div>
    </div>
  )
}
