'use client'

import { useEffect, useState } from 'react'
import type { Plantation } from '@/lib/types'
import { friendlyError } from '@/lib/errors'

// Stubble / cut options — mirrors the field detail page.
const RATOON_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— not set' },
  { value: 'plant_cane', label: 'Plant cane' },
  { value: 'first_stubble', label: '1st stubble' },
  { value: 'second_stubble', label: '2nd stubble' },
  { value: 'third_stubble', label: '3rd stubble' },
  { value: 'fourth_stubble', label: '4th stubble' },
  { value: 'fifth_stubble_plus', label: '5th stubble' },
  { value: 'sixth_stubble_plus', label: '6th+ stubble' },
  { value: 'fallow', label: 'Fallow / open' },
]

// Pops immediately after a block is drawn so the grower fills in the details
// while the block is fresh, instead of hunting for it afterward. The block is
// already saved; this just adds metadata (or "Skip" leaves it as a draft name).
export default function NewBlockModal({
  blockId,
  defaultName,
  onClose,
}: {
  blockId: string
  defaultName: string
  onClose: () => void
}) {
  const [name, setName] = useState(defaultName)
  const [plantationId, setPlantationId] = useState('')
  const [variety, setVariety] = useState('')
  const [ratoon, setRatoon] = useState('')
  const [plantations, setPlantations] = useState<Plantation[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/plantations')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setPlantations((d.plantations ?? []) as Plantation[])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/fields/${blockId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || defaultName,
          plantation_id: plantationId || null,
          variety: variety.trim() || null,
          current_ratoon: ratoon || null,
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.message || 'Save failed')
      }
      onClose()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-primary">New block</h2>
          <p className="text-xs text-gray-500">Fill in the details now, or skip and edit later.</p>
        </div>

        <div>
          <label className="label" htmlFor="nb-name">Block name</label>
          <input
            id="nb-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className="input"
            autoFocus
          />
        </div>

        <div>
          <label className="label" htmlFor="nb-plantation">Plantation</label>
          <select
            id="nb-plantation"
            value={plantationId}
            onChange={(e) => setPlantationId(e.target.value)}
            className="input"
          >
            <option value="">— Unassigned</option>
            {plantations.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="nb-variety">Variety</label>
            <input
              id="nb-variety"
              type="text"
              value={variety}
              onChange={(e) => setVariety(e.target.value)}
              maxLength={50}
              placeholder="e.g. L 01-299"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="nb-ratoon">Stubble / cut</label>
            <select
              id="nb-ratoon"
              value={ratoon}
              onChange={(e) => setRatoon(e.target.value)}
              className="input"
            >
              {RATOON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-xs text-red-700">{error}</p>}

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-sm text-gray-500 hover:text-primary"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save block'}
          </button>
        </div>
      </div>
    </div>
  )
}
