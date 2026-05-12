'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FieldSidebar from './FieldSidebar'
import type { FieldRow } from '@/lib/fields'
import type { Units, CaneState } from '@/lib/types'

const FieldMap = dynamic(() => import('./FieldMap'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-100">
      <p className="text-sm text-gray-500">Loading map…</p>
    </div>
  ),
})

interface MapShellProps {
  initialFields: FieldRow[]
  units: Units
  state: CaneState | null
}

export default function MapShell({ initialFields, units, state }: MapShellProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // Use server data directly. router.refresh() flows new initialFields in.
  // No local mirror — that pattern was infinite-looping with new array refs.
  const fields = initialFields
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalAcres = fields.reduce((sum, f) => sum + Number(f.acreage_cached || 0), 0)

  async function handleCreate(geometry: GeoJSON.Polygon) {
    setBusy(true)
    setError(null)
    try {
      const name = `Field ${fields.length + 1}`
      const res = await fetch('/api/fields', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, geometry }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to save field')
      }
      const { id } = await res.json()
      startTransition(() => router.refresh())
      setSelectedFieldId(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdate(id: string, geometry: GeoJSON.Polygon) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/fields/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ geometry }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to update field')
      }
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 flex min-h-0 relative">
      <FieldSidebar
        fields={fields}
        units={units}
        selectedFieldId={selectedFieldId}
        onSelectField={setSelectedFieldId}
        totalAcres={totalAcres}
      />
      <FieldMap
        fields={fields}
        state={state}
        selectedFieldId={selectedFieldId}
        onSelectField={setSelectedFieldId}
        onCreateField={handleCreate}
        onUpdateField={handleUpdate}
      />
      {(busy || error) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          {busy && (
            <div className="rounded-md bg-white shadow border border-gray-200 px-3 py-1.5 text-sm text-gray-700">
              Saving…
            </div>
          )}
          {error && (
            <div className="rounded-md bg-red-50 border border-red-100 px-3 py-1.5 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
