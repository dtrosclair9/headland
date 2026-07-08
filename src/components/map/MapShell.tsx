'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FieldSidebar from './FieldSidebar'
import NewBlockModal from './NewBlockModal'
import type { ViewMode, ColorBy } from './FieldMap'
import type { FieldRow } from '@/lib/fields'
import type { Units, CaneState } from '@/lib/types'
import { friendlyError } from '@/lib/errors'
import {
  type LayerFilter,
  EMPTY_LAYER_FILTER,
  isLayerFilterActive,
  fieldMatchesFilter,
} from './layer-filter'
import { resolveStageColors, resolveVarietyColors } from '@/lib/resolve-colors'
import type { OrgColorOverrides } from '@/lib/org-colors'
import type { AnnotationRow } from '@/lib/annotations'

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
  // Per-farm custom color overrides (stage + variety), loaded server-side.
  colorOverrides: OrgColorOverrides
  // Hand-drawn reference lines + text labels, loaded server-side.
  initialAnnotations: AnnotationRow[]
}

export default function MapShell({
  initialFields,
  units,
  state,
  colorOverrides,
  initialAnnotations,
}: MapShellProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // Use server data directly. router.refresh() flows new initialFields in.
  // No local mirror — that pattern was infinite-looping with new array refs.
  const fields = initialFields
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // Bulk-select mode (for retrofitting fields to plantations, archiving, etc.)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // After a block is drawn, prompt for its details right away.
  const [newBlock, setNewBlock] = useState<{ id: string; name: string } | null>(null)
  // Reposition mode: the set of block ids being moved/rotated as a group.
  const [repositionIds, setRepositionIds] = useState<Set<string> | null>(null)
  // Map view mode is owned here so the sidebar's print links can follow it
  // (spray-map view → the print links output the B&W spray sheet).
  const [viewMode, setViewMode] = useState<ViewMode>('satellite')
  // Layer selection (FarmWorks-style): which stages/varieties/plantations to
  // highlight. Matching ids feed the map; non-matches render white.
  const [layerFilter, setLayerFilter] = useState<LayerFilter>(EMPTY_LAYER_FILTER)
  const filterIds = useMemo(
    () =>
      isLayerFilterActive(layerFilter)
        ? new Set(fields.filter((f) => fieldMatchesFilter(f, layerFilter)).map((f) => f.id))
        : null,
    [fields, layerFilter],
  )
  // Which palette paints the blocks (filters pick WHICH blocks highlight;
  // colorBy picks the palette, so stage + variety filters never fight).
  const [colorBy, setColorBy] = useState<ColorBy>('stage')
  // Defaults merged with the farm's custom colors — one resolution point for
  // the map fill, the legend, and the sidebar dots.
  const stageColors = useMemo(() => resolveStageColors(colorOverrides.stage), [colorOverrides])
  const varietyColors = useMemo(
    () => resolveVarietyColors(fields.map((f) => f.variety), colorOverrides.variety),
    [fields, colorOverrides],
  )

  // Hand-drawn annotations, kept in client state so draws/deletes apply
  // without a full refresh.
  const [annotations, setAnnotations] = useState<AnnotationRow[]>(initialAnnotations)

  async function handleCreateAnnotation(
    kind: 'line' | 'text',
    geometry: GeoJSON.LineString | GeoJSON.Point,
    text?: string,
  ) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(kind === 'text' ? { kind, geometry, text } : { kind, geometry }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to save annotation')
      }
      const { annotation } = await res.json()
      setAnnotations((prev) => [...prev, annotation as AnnotationRow])
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteAnnotation(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/annotations/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to delete annotation')
      }
      setAnnotations((prev) => prev.filter((a) => a.id !== id))
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

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

  // Collapse the sidebar when repositioning so the map is clear for the gesture.
  useEffect(() => {
    if (repositionIds) setSidebarOpen(false)
  }, [repositionIds])

  async function handleSaveReposition(features: { id: string; geometry: GeoJSON.Polygon }[]) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/fields/bulk-geometry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save new positions')
      }
      setRepositionIds(null)
      startTransition(() => router.refresh())
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

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
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleBulkAssignPlantation(plantationId: string | null) {
    if (selectedIds.size === 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/fields/bulk-plantation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          field_ids: Array.from(selectedIds),
          plantation_id: plantationId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to assign plantation')
      }
      setSelectedIds(new Set())
      setSelectMode(false)
      startTransition(() => router.refresh())
    } catch (e) {
      setError(friendlyError(e))
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
      setError(friendlyError(e))
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
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full flex min-h-0 relative">
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
          viewMode={viewMode}
          layerFilter={layerFilter}
          onLayerFilterChange={setLayerFilter}
          colorBy={colorBy}
          onColorByChange={setColorBy}
          stageColors={stageColors}
          varietyColors={varietyColors}
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
          onBulkAssignPlantation={handleBulkAssignPlantation}
          onBulkRotate={handleBulkRotate}
          onStartReposition={() => {
            if (selectedIds.size) {
              setRepositionIds(new Set(selectedIds))
              setSelectMode(false)
              setSelectedIds(new Set())
            }
          }}
          onRepositionPlantation={(plantationId) =>
            setRepositionIds(
              new Set(fields.filter((f) => f.plantation_id === plantationId).map((f) => f.id)),
            )
          }
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
        state={state}
        selectedFieldId={selectedFieldId}
        onSelectField={setSelectedFieldId}
        onCreateField={handleCreate}
        onUpdateField={handleUpdate}
        onDrawingChange={setDrawing}
        onShowFields={!sidebarOpen ? () => setSidebarOpen(true) : undefined}
        selectMode={selectMode}
        selectedIds={selectedIds}
        onToggleFieldSelected={(id) =>
          setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          })
        }
        repositionIds={repositionIds}
        onSaveReposition={handleSaveReposition}
        onCancelReposition={() => setRepositionIds(null)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        filterIds={filterIds}
        colorBy={colorBy}
        stageColors={stageColors}
        varietyColors={varietyColors}
        annotations={annotations}
        onCreateAnnotation={handleCreateAnnotation}
        onDeleteAnnotation={handleDeleteAnnotation}
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
