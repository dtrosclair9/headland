'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ALL_LABEL_FIELDS, LABEL_FIELD_NAMES, type LabelField } from '@/lib/label-fields'

// Toggle chips in the print preview banner: pick which block facts print,
// see the sheet re-render, and optionally save the picks as the farm's
// default for every future print.
export default function LabelFieldToggles({ active }: { active: LabelField[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function toggle(f: LabelField) {
    const next = active.includes(f) ? active.filter((x) => x !== f) : [...active, f]
    if (next.length === 0) return // at least one fact stays on
    const sp = new URLSearchParams(params.toString())
    sp.set('labels', next.join(','))
    router.replace(`?${sp.toString()}`)
  }

  async function saveDefault() {
    setSaving(true)
    try {
      const res = await fetch('/api/print-prefs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields: active }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 16, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, opacity: 0.8 }}>Print on blocks:</span>
      {ALL_LABEL_FIELDS.map((f) => {
        const on = active.includes(f)
        return (
          <button
            key={f}
            type="button"
            onClick={() => toggle(f)}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.5)',
              background: on ? 'white' : 'transparent',
              color: on ? '#1A3D2E' : 'white',
              cursor: 'pointer',
            }}
          >
            {on ? '✓ ' : ''}
            {LABEL_FIELD_NAMES[f]}
          </button>
        )
      })}
      <button
        type="button"
        onClick={saveDefault}
        disabled={saving}
        style={{
          fontSize: 12,
          fontWeight: 600,
          padding: '3px 10px',
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.5)',
          background: '#E8A33D',
          color: '#1A3D2E',
          cursor: 'pointer',
        }}
      >
        {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save as my default'}
      </button>
    </span>
  )
}
