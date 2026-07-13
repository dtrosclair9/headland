'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ALL_LABEL_FIELDS, LABEL_FIELD_NAMES, type LabelField } from '@/lib/label-fields'

// Toggle chips in the print preview banner: pick which block facts print and
// see the sheet re-render. Saving them (with the paper size) as the farm's
// default is SaveDefaultsButton, placed after all the settings it saves.
export default function LabelFieldToggles({ active }: { active: LabelField[] }) {
  const router = useRouter()
  const params = useSearchParams()

  function toggle(f: LabelField) {
    const next = active.includes(f) ? active.filter((x) => x !== f) : [...active, f]
    if (next.length === 0) return // at least one fact stays on
    const sp = new URLSearchParams(params.toString())
    sp.set('labels', next.join(','))
    router.replace(`?${sp.toString()}`)
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
    </span>
  )
}
