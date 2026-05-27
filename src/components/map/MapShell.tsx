'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FieldSidebar from './FieldSidebar'
import NewBlockModal from './NewBlockModal'
import type { FieldRow } from '@/lib/fields'
import type { Units, CaneState, Ditch } from '@/lib/types'

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
  initialDitches: Ditch[]
  units: Units
  state: CaneState | null
}

export default function MapShell({ initialFields, initialDitches, units, state }: MapShellProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // Use server data directly. router.refresh() flows new initialFields in.
  // No local mirror — that pattern was infinite-looping with new array refs.
  const fields = initialFields
  const ditches = initialDitches
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // Bulk-select mode (for retrofitting fields to sections, archiving, etc.)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // After a block is drawn, prompt for its details right away.
  const [newBlock, setNewBlock] = useState<{ id: string; name: string } | null>(null)

  // Default the sidebar closed on mobile so the map is full-screen on first view.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }, [])

  // Auto-collapse the sidebar whenever drawing begins so the user has the
  // whole screen to sketch. They can reopen it with the Fields button.
  useEffect(() => {
    if (drawing) setSidebarOpen(false)
  }, [drawing])

  const totalAcres = fields.reduce((sum, f) => sum + Number(f.acreage_cached || 0), 0)

  async function handleCreate(geometry: GeoJSON.Polygon) {
    setBusy(true)
    setError(null)
    try {
      const name = `Block ${fields.length + 1}`
      const res = await fetch('/api/fields', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, geometry }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to save block')
      }
      const { id } = await res.json()
      startTransition(() => router.refresh())
      setSelectedFieldId(id)
      // Pop the details modal so the grower names/tags the block while it's fresh.
      setNewBlock({ id, name })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleBulkAssignSection(sectionId: string | null) {
    if (selectedIds.size === 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/fields/bulk-section', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          field_ids: Array.from(selectedIds),
          section_id: sectionId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to assign section')
      }
      setSelectedIds(new Set())
      setSelectMode(false)
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateDitch(geometry: GeoJSON.LineString) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/ditches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ geometry }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to save ditch')
      }
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteDitch(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/ditches/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to delete ditch')
      }
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleBulkRotate(): Promise<{ advanced: number; skipped: number } | null> {
    if (selectedIds.size === 0) return null
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/fields/bulk-rotate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ field_ids: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Rotation failed')
      }
      const result = (await res.json()) as { advanced: number; skipped: number }
      setSelectedIds(new Set())
      setSelectMode(false)
      startTransition(() => router.refresh())
      return result
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
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
      {/* Sidebar — slide-over drawer on mobile, persistent column on md+ when open.
          On desktop, closing collapses the column entirely so the map fills the screen. */}
      <div
        className={`${
          sidebarOpen
            ? 'translate-x-0 pointer-events-auto md:relative'
            : '-translate-x-full pointer-events-none md:hidden'
        } absolute inset-y-0 left-0 z-30 transform transition-transform duration-200 ease-out flex`}
      >
        <FieldSidebar
          fields={fields}
          units={units}
          selectedFieldId={selectedFieldId}
          onSelectField={(id) => {
            setSelectedFieldId(id)
            // On mobile, picking a field should reveal the map; collapse the drawer.
            if (typeof window !== 'undefined' && window.innerWidth < 768) {
              setSidebarOpen(false)
            }
          }}
          totalAcres={totalAcres}
          onClose={() => setSidebarOpen(false)}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelectMode={() => {
            setSelectMode((on) => {
              if (on) setSelectedIds(new Set())
              return !on
            })
          }}
          onToggleFieldSelected={(id) => {
            setSelectedIds((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }}
          onBulkAssignSection={handleBulkAssignSection}
          onBulkRotate={handleBulkRotate}
        />
      </div>

      {/* Backdrop on mobile when drawer is open — tap to close */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close fields panel"
          onClick={() => setSidebarOpen(false)}
          className="md:hidden absolute inset-0 z-20 bg-black/30"
        />
      )}

      <FieldMap
        fields={fields}
        ditches={ditches}
        state={state}
        selectedFieldId={selectedFieldId}
        onSelectField={setSelectedFieldId}
        onCreateField={handleCreate}
        onUpdateField={handleUpdate}
        onCreateDitch={handleCreateDitch}
        onDeleteDitch={handleDeleteDitch}
        onDrawingChange={setDrawing}
        onShowFields={!sidebarOpen ? () => setSidebarOpen(true) : undefined}
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

      {newBlock && (
        <NewBlockModal
          blockId={newBlock.id}
          defaultName={newBlock.name}
          onClose={() => {
            setNewBlock(null)
            startTransition(() => router.refresh())
          }}
        />
      )}
    </div>
  )
}
