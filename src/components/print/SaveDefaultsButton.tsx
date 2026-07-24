'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { LabelField } from '@/lib/label-fields'

// Saves the CURRENT print settings — the four block facts AND the paper
// size — as the farm's default for every future print. Sits after both
// controls so it reads as "save all of this."
export default function SaveDefaultsButton({ fields }: { fields: LabelField[] }) {
  const params = useSearchParams()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/view-defaults', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fields,
          ...(params.get('paper') ? { paper: params.get('paper') } : {}),
        }),
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
    <button
      type="button"
      onClick={save}
      disabled={saving}
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.5)',
        background: '#E8A33D',
        color: '#1A3D2E',
        cursor: 'pointer',
        marginLeft: 14,
      }}
    >
      {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save as my default'}
    </button>
  )
}
