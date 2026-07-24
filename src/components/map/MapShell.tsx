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
import type { PlanGroupRow } from '@/lib/fly-plans'
import { formatArea } from '@/lib/units'
import {
  ALL_LABEL_FIELDS,
  MAP_VIEW_KEY,
  resolveMapView,
  type LabelField,
  type ViewDefaults,
} from '@/lib/label-fields'

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
  // Saved plans (each a set of colored steps), loaded server-side.
  initialPlanGroups: PlanGroupRow[]
  // Deep link (?focus=blockId): select this block and zoom the map to it —
  // how Operations to-dos land you on the right block.
  focusFieldId: string | null
  // Archived monthly snapshot: the same map, read-only — layers, plantation
  // isolation, color-by, and printing all work; nothing can be edited.
  snapshot?: { id: string; label: string } | null
  // Shared org default for the map view (labels + color-by) + its version stamp.
  viewDefaults?: ViewDefaults
}

export default function MapShell({
  initialFields,
  units,
  state,
  colorOverrides,
  initialAnnotations,
  initialPlanGroups,
  focusFieldId,
  snapshot = null,
  viewDefaults,
}: MapShellProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // Use server data directly. router.refresh() flows new initialFields in.
  // No local mirror — that pattern was infinite-looping with new array refs.
  const fields = initialFields
  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields])
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
  // Plans: each a SET of colored steps that communicate. Viewing a plan
  // paints every step's blocks in that step's color on the white map.
  // Drafting a STEP reuses bulk-select to pick blocks — blocks already in the
  // plan's other steps render locked in their colors and can't be re-picked.
  const [planGroups, setPlanGroups] = useState<PlanGroupRow[]>(initialPlanGroups)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [planDraft, setPlanDraft] = useState<{
    groupId: string
    name: string
    color: string
  } | null>(null)
  const activeGroup = activeGroupId
    ? (planGroups.find((g) => g.id === activeGroupId) ?? null)
    : null
  const draftGroup = planDraft
    ? (planGroups.find((g) => g.id === planDraft.groupId) ?? null)
    : null
  // id -> color of the step it already belongs to (locked while drafting).
  const lockedColors = useMemo(() => {
    if (!draftGroup) return null
    const m: Record<string, string> = {}
    for (const step of draftGroup.steps) for (const id of step.block_ids) m[id] = step.color
    return m
  }, [draftGroup])
  // id -> step color across the whole plan being viewed.
  const groupColors = useMemo(() => {
    if (!activeGroup) return null
    const m: Record<string, string> = {}
    for (const step of activeGroup.steps) for (const id of step.block_ids) m[id] = step.color
    return m
  }, [activeGroup])
  const blockColors = planDraft ? lockedColors : groupColors

  const filterIds = useMemo(() => {
    // Drafting a step: the blocks picked so far fill with the step color AND
    // the plan's other steps stay visible in their colors (locked) — that's
    // how the steps communicate while picking. Everything else stays white.
    if (planDraft) {
      const ids = new Set(selectedIds)
      if (lockedColors) for (const id of Object.keys(lockedColors)) ids.add(id)
      return ids
    }
    if (activeGroup) return new Set(activeGroup.steps.flatMap((s) => s.block_ids))
    if (isLayerFilterActive(layerFilter))
      return new Set(fields.filter((f) => fieldMatchesFilter(f, layerFilter)).map((f) => f.id))
    if (deselected) return new Set<string>()
    return null
  }, [fields, layerFilter, deselected, activeGroup, planDraft, selectedIds, lockedColors])
  // White-map look: deselect-all, a fly plan view, or a plan draft in progress
  // (labels stay, blocks whiten).
  const whiteMap = deselected || activeGroup !== null || planDraft !== null
  // Plantation isolation: when plantations are picked, only their blocks are
  // on the map (others omitted entirely) and the camera zooms to them.
  // Viewing a plan isolates the same way — just the plantation(s) the plan's
  // blocks live on, not the whole farm.
  const isolatedPlantations = useMemo(() => {
    if (activeGroup) {
      const planIds = new Set(activeGroup.steps.flatMap((s) => s.block_ids))
      return Array.from(
        new Set(fields.filter((f) => planIds.has(f.id)).map((f) => f.plantation_id ?? null)),
      )
    }
    return layerFilter.plantations
  }, [activeGroup, fields, layerFilter.plantations])
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
        activeGroupId ?? '',
        deselected ? 'D' : '',
        planDraft ? 'draft' : '',
      ].join('|'),
    [layerFilter, activeGroupId, deselected, planDraft],
  )

  // Save the step being drafted into its plan.
  async function handleSaveStepDraft(): Promise<boolean> {
    if (!planDraft || selectedIds.size === 0) return false
    setBusy(true)
    setError(null)
    try {
      const group = planGroups.find((g) => g.id === planDraft.groupId)
      const position = (group?.steps.reduce((m, s) => Math.max(m, s.position), 0) ?? 0) + 1
      const res = await fetch('/api/fly-plans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: planDraft.name,
          color: planDraft.color,
          block_ids: Array.from(selectedIds),
          group_id: planDraft.groupId,
          position,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || err.message || 'Failed to save the step')
      }
      const { plan } = await res.json()
      setPlanGroups((prev) =>
        prev.map((g) =>
          g.id === planDraft.groupId
            ? { ...g, completed_at: null, steps: [...g.steps, plan] }
            : g,
        ),
      )
      setPlanDraft(null)
      setSelectMode(false)
      setSelectedIds(new Set())
      setActiveGroupId(planDraft.groupId)
      setDeselected(false)
      return true
    } catch (e) {
      setError(friendlyError(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateGroup(name: string): Promise<string | null> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/plan-groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create the plan')
      }
      const { group } = await res.json()
      setPlanGroups((prev) => [...prev, group as PlanGroupRow])
      return (group as PlanGroupRow).id
    } catch (e) {
      setError(friendlyError(e))
      return null
    } finally {
      setBusy(false)
    }
  }

  // Re-pull plans from the server — step completion cascades into the
  // group's completed state server-side, so refetching keeps both exact.
  async function refetchPlanGroups() {
    try {
      const res = await fetch('/api/plan-groups')
      if (res.ok) {
        const { groups } = await res.json()
        setPlanGroups(groups as PlanGroupRow[])
      }
    } catch {
      /* next router.refresh()/reload picks it up */
    }
  }

  // Logging work from a step completes it; when the last step completes the
  // whole plan reads complete (and stays viewable as a layer).
  async function handleCompleteStep(id: string) {
    try {
      await fetch(`/api/fly-plans/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      })
    } finally {
      await refetchPlanGroups()
    }
  }

  async function handleDeleteStep(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/fly-plans/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete the step')
      }
      await refetchPlanGroups()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteGroup(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/plan-groups/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete the plan')
      }
      setPlanGroups((prev) => prev.filter((g) => g.id !== id))
      if (activeGroupId === id) setActiveGroupId(null)
      if (planDraft?.groupId === id) {
        setPlanDraft(null)
        setSelectMode(false)
        setSelectedIds(new Set())
      }
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  // Which palette paints the blocks (filters pick WHICH blocks highlight;
  // colorBy picks the palette, so stage + variety filters never fight).
  // The map view (labels + color-by) is a per-device override seeded from the
  // shared org default; "Save as default" promotes the current view to the org.
  const savedDefaultInit: ViewDefaults = viewDefaults ?? {
    labelFields: [...ALL_LABEL_FIELDS],
    colorBy: 'stage',
    updatedAt: '',
  }
  const [savedDefault, setSavedDefault] = useState<ViewDefaults>(savedDefaultInit)
  const [labelFields, setLabelFields] = useState<Set<LabelField>>(
    new Set(savedDefaultInit.labelFields),
  )
  const [colorBy, setColorByState] = useState<ColorBy>(savedDefaultInit.colorBy)
  const [savingViewDefault, setSavingViewDefault] = useState(false)

  // Hydrate from localStorage AFTER mount (avoids an SSR hydration mismatch on
  // the Labels checkboxes — server renders the default, client corrects).
  useEffect(() => {
    const v = resolveMapView(localStorage.getItem(MAP_VIEW_KEY), savedDefaultInit)
    setLabelFields(new Set(v.labelFields))
    setColorByState(v.colorBy)
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persistView = (nextFields: Set<LabelField>, nextColorBy: ColorBy) => {
    localStorage.setItem(
      MAP_VIEW_KEY,
      JSON.stringify({
        labelFields: [...nextFields],
        colorBy: nextColorBy,
        basedOn: savedDefault.updatedAt,
      }),
    )
  }
  const handleLabelFieldsChange = (next: Set<LabelField>) => {
    setLabelFields(next)
    persistView(next, colorBy)
  }
  // Wrapper preserves the existing onColorByChange={setColorBy} call site while
  // persisting the pick to the per-device view.
  const setColorBy = (cb: ColorBy) => {
    setColorByState(cb)
    persistView(labelFields, cb)
  }
  const handleSaveViewDefault = async () => {
    if (labelFields.size === 0) return
    setSavingViewDefault(true)
    try {
      const res = await fetch('/api/view-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: [...labelFields], colorBy }),
      })
      if (res.ok) {
        const { updatedAt } = (await res.json()) as { updatedAt: string }
        setSavedDefault({ labelFields: [...labelFields], colorBy, updatedAt })
        localStorage.removeItem(MAP_VIEW_KEY) // current === default now
      }
    } finally {
      setSavingViewDefault(false)
    }
  }
  const handleResetViewDefault = () => {
    localStorage.removeItem(MAP_VIEW_KEY)
    setLabelFields(new Set(savedDefault.labelFields))
    setColorByState(savedDefault.colorBy)
  }
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
    style?: { size?: number; rotation?: number; width?: number; color?: string },
  ) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          kind === 'text'
            ? { kind, geometry, text, size: style?.size, rotation: style?.rotation, color: style?.color }
            : { kind, geometry, width: style?.width, color: style?.color },
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

  async function handleUpdateAnnotation(
    id: string,
    patch: {
      geometry?: GeoJSON.LineString | GeoJSON.Point
      text?: string
      size?: number
      rotation?: number
      width?: number | null
      color?: string
    },
  ): Promise<void> {
    setError(null)
    try {
      const res = await fetch(`/api/annotations/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Could not update that.')
      }
      // Merge locally — creates/deletes already do. A label drag shouldn't
      // refetch the whole farm (600+ blocks) just to move one note.
      setAnnotations((prev) =>
        prev.map((a) => (a.id === id ? ({ ...a, ...patch } as AnnotationRow) : a)),
      )
    } catch (e) {
      setError(friendlyError(e))
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


  // Bulk "Assign to…" — same variety or same cycle on every selected block.
  async function handleBulkEdit(
    set: { variety: string | null } | { cycle: string | null },
  ): Promise<void> {
    if (selectedIds.size === 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/fields/bulk-edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ field_ids: Array.from(selectedIds), set }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Bulk edit failed')
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

  async function handleBulkDelete(): Promise<void> {
    if (selectedIds.size === 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/fields/bulk-archive', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ field_ids: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Delete failed')
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
            // Picking a layer takes over from deselect-all / a plan view.
            setActiveGroupId(null)
          }}
          deselected={deselected}
          onSelectAll={() => {
            setLayerFilter(EMPTY_LAYER_FILTER)
            setDeselected(false)
            setActiveGroupId(null)
          }}
          onDeselectAll={() => {
            setLayerFilter(EMPTY_LAYER_FILTER)
            setDeselected(true)
            setActiveGroupId(null)
          }}
          planGroups={planGroups}
          activeGroupId={activeGroupId}
          onViewGroup={(id) => {
            setActiveGroupId(id)
            setLayerFilter(EMPTY_LAYER_FILTER)
            setDeselected(false)
          }}
          onCloseGroup={() => setActiveGroupId(null)}
          onCreateGroup={handleCreateGroup}
          onDeleteGroup={handleDeleteGroup}
          onDeleteStep={handleDeleteStep}
          onCompleteStep={handleCompleteStep}
          planDraft={planDraft}
          onStartStepDraft={(draft) => {
            setPlanDraft(draft)
            setActiveGroupId(null)
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
          onSaveStepDraft={handleSaveStepDraft}
          colorBy={colorBy}
          onColorByChange={setColorBy}
          stageColors={stageColors}
          varietyColors={varietyColors}
          labelFields={labelFields}
          onLabelFieldsChange={handleLabelFieldsChange}
          onSaveViewDefault={handleSaveViewDefault}
          onResetViewDefault={handleResetViewDefault}
          savingViewDefault={savingViewDefault}
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
            // Blocks already in another step of the plan being drafted are
            // locked — a block belongs to exactly one step per plan.
            if (planDraft && lockedColors && lockedColors[id]) return
            setSelectedIds((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }}
          onBulkAssignPlantation={handleBulkAssignPlantation}
          onBulkEdit={handleBulkEdit}
          onBulkRotate={handleBulkRotate}
          onBulkDelete={handleBulkDelete}
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
        onToggleFieldSelected={(id) => {
          if (planDraft && lockedColors && lockedColors[id]) return
          setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          })
        }}
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
        highlightColor={planDraft ? planDraft.color : null}
        blockColors={blockColors}
        colorBy={colorBy}
        stageColors={stageColors}
        varietyColors={varietyColors}
        labelFields={labelFields}
        annotations={annotations}
        onCreateAnnotation={handleCreateAnnotation}
        onUpdateAnnotation={handleUpdateAnnotation}
        onDeleteAnnotation={handleDeleteAnnotation}
      />

      {/* Plan legend — bottom-right while a plan is on the map: every step
          with its color, block count, and acreage (what the pilot bills by),
          plus the plan total. Replaces the cycle/variety legend, which is
          suppressed while per-block plan colors paint. */}
      {activeGroup && (
        <div className="absolute bottom-8 right-3 z-10">
          <div className="rounded-md bg-white/95 backdrop-blur shadow-md border border-gray-100 p-3 w-52 max-h-72 overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-2 truncate">
              {activeGroup.name}
            </p>
            <ul className="space-y-1.5">
              {activeGroup.steps.map((step) => {
                const live = step.block_ids.filter((id) => fieldById.has(id))
                const acres = live.reduce(
                  (sum, id) => sum + Number(fieldById.get(id)?.acreage_cached || 0),
                  0,
                )
                return (
                  <li key={step.id} className="flex items-center gap-2 text-xs text-gray-700">
                    <span
                      className="inline-block w-3.5 h-3.5 rounded border border-gray-300 shadow-sm shrink-0"
                      style={{ backgroundColor: step.color }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate">
                      {step.name}
                      {step.completed_at && <span className="ml-1 text-green-700 font-bold">✓</span>}
                    </span>
                    <span className="text-gray-500 shrink-0">
                      {formatArea(acres, units).primary}
                    </span>
                  </li>
                )
              })}
              <li className="flex items-center justify-between gap-2 text-xs font-semibold text-gray-800 pt-1.5 mt-0.5 border-t border-gray-100">
                <span>Total</span>
                <span>
                  {
                    formatArea(
                      activeGroup.steps
                        .flatMap((step) => step.block_ids)
                        .filter((id) => fieldById.has(id))
                        .reduce((sum, id) => sum + Number(fieldById.get(id)?.acreage_cached || 0), 0),
                      units,
                    ).primary
                  }
                </span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {snapshot && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-primary text-white shadow-lg px-4 py-2 text-sm">
            <span className="font-semibold">{snapshot.label}</span>
            <span className="text-white/70 hidden sm:inline">read-only history</span>
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
