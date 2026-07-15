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
import type { FlyPlanRow } from '@/lib/fly-plans'

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
  // Saved fly plans, loaded server-side.
  initialFlyPlans: FlyPlanRow[]
  // Deep link (?focus=blockId): select this block and zoom the map to it —
  // how Operations to-dos land you on the right block.
  focusFieldId: string | null
  // Archived monthly snapshot: the same map, read-only — layers, plantation
  // isolation, color-by, and printing all work; nothing can be edited.
  snapshot?: { id: string; label: string } | null
}

export default function MapShell({
  initialFields,
  units,
  state,
  colorOverrides,
  initialAnnotations,
  initialFlyPlans,
  focusFieldId,
  snapshot = null,
}: MapShellProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // Use server data directly. router.refresh() flows new initialFields in.
  // No local mirror — that pattern was infinite-looping with new array refs.
  const fields = initialFields
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(focusFieldId)
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
  // Crop map is the login default — the working surface; satellite is for
  // drawing / ground-truthing.
  const [viewMode, setViewMode] = useState<ViewMode>('crop')
  // Layer selection (FarmWorks-style): which stages/varieties/plantations to
  // highlight. Matching ids feed the map; non-matches render white.
  const [layerFilter, setLayerFilter] = useState<LayerFilter>(EMPTY_LAYER_FILTER)
  // Deselect-all: everything white with all labels visible in black — the
  // pilot map, live. "Select all" (the login default) shows the full colors.
  const [deselected, setDeselected] = useState(false)
  // Fly plans: saved pilot selections; viewing one paints its blocks the plan
  // color on the white map. Drafting one reuses bulk-select to pick blocks.
  const [flyPlans, setFlyPlans] = useState<FlyPlanRow[]>(initialFlyPlans)
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [planDraft, setPlanDraft] = useState<{ name: string; color: string } | null>(null)
  const activePlan = activePlanId ? (flyPlans.find((p) => p.id === activePlanId) ?? null) : null

  const filterIds = useMemo(() => {
    // Drafting a fly plan: ONLY the blocks picked so far fill with the plan
    // color — layer picks (a plantation, a stage) still isolate/zoom the map
    // for navigation but must stay white until tapped.
    if (planDraft) return new Set(selectedIds)
    if (activePlan) return new Set(activePlan.block_ids)
    if (isLayerFilterActive(layerFilter))
      return new Set(fields.filter((f) => fieldMatchesFilter(f, layerFilter)).map((f) => f.id))
    if (deselected) return new Set<string>()
    return null
  }, [fields, layerFilter, deselected, activePlan, planDraft, selectedIds])
  // White-map look: deselect-all, a fly plan view, or a plan draft in progress
  // (labels stay, blocks whiten).
  const whiteMap = deselected || activePlan !== null || planDraft !== null
  // Plantation isolation: when plantations are picked, only their blocks are
  // on the map (others omitted entirely) and the camera zooms to them.
  // Viewing a plan isolates the same way — just the plantation(s) the plan's
  // blocks live on, not the whole farm.
  const isolatedPlantations = useMemo(() => {
    if (activePlan) {
      const planIds = new Set(activePlan.block_ids)
      return Array.from(
        new Set(fields.filter((f) => planIds.has(f.id)).map((f) => f.plantation_id ?? null)),
      )
    }
    return layerFilter.plantations
  }, [activePlan, fields, layerFilter.plantations])
  const visibleIds = useMemo(
    () =>
      isolatedPlantations.length > 0
        ? new Set(
            fields
              .filter((f) => isolatedPlantations.includes(f.plantation_id ?? null))
              .map((f) => f.id),
          )
        : null,
    [fields, isolatedPlantations],
  )
  const visibleKey = isolatedPlantations
    .map((p) => p ?? '__none')
    .sort()
    .join(',')
  // A stable signature of the SELECTION INTENT — changes only when the grower
  // picks/clears a stage, variety, or plantation, views/closes a plan, or
  // toggles deselect-all. It deliberately excludes live block taps (drafting)
  // and the fields data itself, so the camera reframes on a layer change but
  // NOT on a plain data refresh (rotate/move/log keep your place).
  const selectionKey = useMemo(
    () =>
      [
        [...layerFilter.stages].sort().join(','),
        [...layerFilter.varieties].sort().join(','),
        [...layerFilter.plantations].map((p) => p ?? '__none').sort().join(','),
        activePlanId ?? '',
        deselected ? 'D' : '',
        planDraft ? 'draft' : '',
      ].join('|'),
    [layerFilter, activePlanId, deselected, planDraft],
  )

  async function handleCreatePlan(): Promise<boolean> {
    if (!planDraft || selectedIds.size === 0) return false
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/fly-plans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: planDraft.name,
          color: planDraft.color,
          block_ids: Array.from(selectedIds),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to save fly plan')
      }
      const { plan } = await res.json()
      setFlyPlans((prev) => [...prev, plan as FlyPlanRow])
      setPlanDraft(null)
      setSelectMode(false)
      setSelectedIds(new Set())
      setActivePlanId((plan as FlyPlanRow).id)
      setDeselected(false)
      return true
    } catch (e) {
      setError(friendlyError(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  // Logging work from a plan completes it: the record lives in Operations,
  // the plan drops off the Plans tab.
  async function handleCompletePlan(id: string) {
    try {
      await fetch(`/api/fly-plans/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      })
    } finally {
      setFlyPlans((prev) => prev.filter((p) => p.id !== id))
      if (activePlanId === id) setActivePlanId(null)
    }
  }

  async function handleDeletePlan(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/fly-plans/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to delete fly plan')
      }
      setFlyPlans((prev) => prev.filter((p) => p.id !== id))
      if (activePlanId === id) setActivePlanId(null)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }
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
    style?: { size?: number; rotation?: number; width?: number },
  ) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          kind === 'text'
            ? { kind, geometry, text, size: style?.size, rotation: style?.rotation }
            : { kind, geometry, width: style?.width },
        ),
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
          onLayerFilterChange={(f) => {
            setLayerFilter(f)
            // Picking a layer takes over from deselect-all / a fly plan view.
            setActivePlanId(null)
          }}
          deselected={deselected}
          onSelectAll={() => {
            setLayerFilter(EMPTY_LAYER_FILTER)
            setDeselected(false)
            setActivePlanId(null)
          }}
          onDeselectAll={() => {
            setLayerFilter(EMPTY_LAYER_FILTER)
            setDeselected(true)
            setActivePlanId(null)
          }}
          flyPlans={flyPlans}
          activePlanId={activePlanId}
          onViewPlan={(id) => {
            setActivePlanId(id)
            setLayerFilter(EMPTY_LAYER_FILTER)
          }}
          onClosePlan={() => setActivePlanId(null)}
          onDeletePlan={handleDeletePlan}
          onCompletePlan={handleCompletePlan}
          planDraft={planDraft}
          onStartPlanDraft={(draft) => {
            setPlanDraft(draft)
            setActivePlanId(null)
            setDeselected(true)
            setLayerFilter(EMPTY_LAYER_FILTER)
            setSelectMode(true)
            setSelectedIds(new Set())
          }}
          onCancelPlanDraft={() => {
            setPlanDraft(null)
            setSelectMode(false)
            setSelectedIds(new Set())
          }}
          onSavePlanDraft={handleCreatePlan}
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
          snapshot={snapshot}
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
        readOnly={!!snapshot}
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
        focusFieldId={focusFieldId}
        visibleIds={visibleIds}
        visibleKey={visibleKey}
        selectionKey={selectionKey}
        whiteMap={whiteMap}
        highlightColor={activePlan?.color ?? (planDraft ? planDraft.color : null)}
        colorBy={colorBy}
        stageColors={stageColors}
        varietyColors={varietyColors}
        annotations={annotations}
        onCreateAnnotation={handleCreateAnnotation}
        onDeleteAnnotation={handleDeleteAnnotation}
      />

      {snapshot && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-primary text-white shadow-lg px-4 py-2 text-sm">
            <span className="font-semibold">{snapshot.label}</span>
            <span className="text-white/70 hidden sm:inline">read-only history</span>
            <a
              href={`/snapshots/${snapshot.id}/print`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline underline-offset-2 hover:text-accent"
            >
              Print
            </a>
            <a href="/app/map" className="font-semibold underline underline-offset-2 hover:text-accent">
              Today&apos;s map
            </a>
          </div>
        </div>
      )}

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
