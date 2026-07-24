'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FieldRow } from '@/lib/fields'
import type { Plantation, Units } from '@/lib/types'
import { formatArea } from '@/lib/units'
import { friendlyError } from '@/lib/errors'
import type { ViewMode, ColorBy } from './FieldMap'
import type { LabelField } from '@/lib/label-fields'
import type { PlanGroupRow } from '@/lib/fly-plans'
import LayersPanel from './LayersPanel'
import PlansPanel from './PlansPanel'
import BulkLogPanel from './BulkLogPanel'
import { type LayerFilter, isLayerFilterActive } from './layer-filter'

interface FieldSidebarProps {
  fields: FieldRow[]
  units: Units
  viewMode: ViewMode
  // Layer selection state (owned by MapShell so the map can read matches).
  layerFilter: LayerFilter
  onLayerFilterChange: (f: LayerFilter) => void
  // Deselect-all (white pilot map) vs select-all (full colors, login default).
  deselected: boolean
  onSelectAll: () => void
  onDeselectAll: () => void
  // Plans: each a set of colored steps that communicate.
  planGroups: PlanGroupRow[]
  activeGroupId: string | null
  onViewGroup: (id: string) => void
  onCloseGroup: () => void
  onCreateGroup: (name: string) => Promise<string | null>
  onDeleteGroup: (id: string) => Promise<void>
  onDeleteStep: (id: string) => Promise<void>
  onCompleteStep: (id: string) => Promise<void>
  planDraft: { groupId: string; name: string; color: string } | null
  onStartStepDraft: (draft: { groupId: string; name: string; color: string }) => void
  onCancelPlanDraft: () => void
  onSaveStepDraft: () => Promise<boolean>
  // Palette that paints the blocks + the resolved per-farm colors.
  colorBy: ColorBy
  onColorByChange: (c: ColorBy) => void
  stageColors: import('@/lib/resolve-colors').StageColor[]
  varietyColors: Record<string, string>
  // Map label toggles + the shared-default save/reset, forwarded to LayersPanel.
  labelFields?: ReadonlySet<LabelField>
  onLabelFieldsChange?: (next: Set<LabelField>) => void
  onSaveViewDefault?: () => void
  onResetViewDefault?: () => void
  savingViewDefault?: boolean
  selectedFieldId: string | null
  onSelectField: (id: string | null) => void
  totalAcres: number
  onClose?: () => void
  // Bulk-select mode (for assigning plantations to many fields at once).
  selectMode: boolean
  selectedIds: Set<string>
  onToggleSelectMode: () => void
  onToggleFieldSelected: (id: string) => void
  // plantationId: pass a UUID to assign, or null to unassign.
  onBulkAssignPlantation: (plantationId: string | null) => Promise<void>
  // Bulk-set the same variety or cycle on every selected block.
  onBulkEdit: (set: { variety: string | null } | { cycle: string | null }) => Promise<void>
  // Bulk delete (archives — records stay in history).
  onBulkDelete: () => Promise<void>
  onBulkRotate: () => Promise<{ advanced: number; skipped: number } | null>
  // Reposition (move/rotate) the currently-selected blocks on the map.
  onStartReposition: () => void
  // Reposition a whole plantation's blocks at once (the "farm drifted as a unit" case).
  onRepositionPlantation: (plantationId: string) => void
  // Set when viewing an archived monthly snapshot: hides every mutating
  // affordance (select mode, bulk ops, plans, edit links) and routes print
  // links through the snapshot's data instead of the live farm.
  snapshot?: { id: string } | null
}

export default function FieldSidebar({
  fields,
  units,
  viewMode,
  layerFilter,
  onLayerFilterChange,
  deselected,
  onSelectAll,
  onDeselectAll,
  planGroups,
  activeGroupId,
  onViewGroup,
  onCloseGroup,
  onCreateGroup,
  onDeleteGroup,
  onDeleteStep,
  onCompleteStep,
  planDraft,
  onStartStepDraft,
  onCancelPlanDraft,
  onSaveStepDraft,
  colorBy,
  onColorByChange,
  stageColors,
  varietyColors,
  labelFields,
  onLabelFieldsChange,
  onSaveViewDefault,
  onResetViewDefault,
  savingViewDefault,
  selectedFieldId,
  onSelectField,
  totalAcres,
  onClose,
  selectMode,
  selectedIds,
  onToggleSelectMode,
  onToggleFieldSelected,
  onBulkAssignPlantation,
  onBulkEdit,
  onBulkDelete,
  onBulkRotate,
  onStartReposition,
  onRepositionPlantation,
  snapshot = null,
}: FieldSidebarProps) {
  // In the white-map state (deselect-all) the print links output the B&W
  // spray-style sheet (and say so).
  const isSpray = deselected && !activeGroupId
  // Combined acreage of the bulk-selected blocks (live as you tap blocks).
  const selectedArea = useMemo(
    () =>
      formatArea(
        fields.reduce((s, f) => (selectedIds.has(f.id) ? s + Number(f.acreage_cached || 0) : s), 0),
        units,
      ),
    [fields, selectedIds, units],
  )
  // "Assign to…" tree: menu -> plantation | cycle (year cane) | variety.
  const [assignView, setAssignView] = useState<null | 'menu' | 'plantation' | 'cycle' | 'variety'>(null)
  const [rotateOpen, setRotateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [logSuccess, setLogSuccess] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)
  // Sidebar tab: layers is the primary working surface; plans are first-class
  // (spray passes, fertilizer runs, harvest orders); blocks is management.
  const [tab, setTab] = useState<'blocks' | 'layers' | 'plans'>('layers')
  const filterOn = isLayerFilterActive(layerFilter)

  // Group blocks by plantation (named plantations alpha, Unassigned last). Within
  // each plantation, blocks are sorted naturally by name (see the sort below).
  const groups = useMemo(() => {
    const map = new Map<string, FieldRow[]>()
    for (const f of fields) {
      const key = f.plantation_name ?? ''
      const arr = map.get(key) ?? []
      arr.push(f)
      map.set(key, arr)
    }
    return Array.from(map.keys())
      .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
      .map((name) => {
        // Sort blocks within every plantation naturally by name (2a, 16f, 31e, 35b,
        // 39b…) so similarly-named blocks sit adjacent — much easier to scan and
        // to multi-select. Applies to assigned plantations and Unassigned alike.
        const sorted = [...map.get(name)!].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
        )
        return { name, fields: sorted }
      })
  }, [fields])

  // Bring the selected block to the top of the list so it's never buried.
  const selectedRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    // block: 'center' — scrolling to 'start' parked the card under the sticky
    // plantation header, cutting off the block name.
    if (selectedFieldId) selectedRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selectedFieldId])

  return (
    <aside className="w-72 border-r border-gray-100 bg-white flex flex-col shadow-xl md:shadow-none">
      {/* Tab bar IS the header — the farm's totals already lead the Layers
          panel ("500 blocks · 3291 ac"), so a separate totals block up top
          was pure duplication stealing nav height. */}
      {fields.length > 0 && (
        <div className="px-2 pt-2 border-b border-gray-100 flex gap-1 items-center">
          {(
            [
              ['layers', 'Layers'],
              ['blocks', 'Blocks'],
              ...(snapshot ? [] : ([['plans', 'Plans']] as const)),
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 text-sm font-semibold px-3 py-2 rounded-t-md border-b-2 transition flex items-center justify-center gap-1.5 ${
                tab === key
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-gray-500 hover:text-primary'
              }`}
            >
              {label}
              {key === 'layers' && filterOn && (
                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent" />
              )}
              {key === 'plans' && (activeGroupId || planDraft) && (
                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent" />
              )}
            </button>
          ))}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close fields panel"
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-primary shrink-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      )}

      {tab === 'layers' && fields.length > 0 ? (
        <LayersPanel
          fields={fields}
          units={units}
          filter={layerFilter}
          onFilterChange={onLayerFilterChange}
          deselected={deselected}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
          activeGroupId={activeGroupId}
          planGroups={planGroups}
          onToggleGroup={(id) => (activeGroupId === id ? onCloseGroup() : onViewGroup(id))}
          colorBy={colorBy}
          onColorByChange={onColorByChange}
          stageColors={stageColors}
          varietyColors={varietyColors}
          isSpray={isSpray}
          snapshotId={snapshot?.id ?? null}
          labelFields={labelFields}
          onLabelFieldsChange={onLabelFieldsChange}
          onSaveViewDefault={onSaveViewDefault}
          onResetViewDefault={onResetViewDefault}
          savingViewDefault={savingViewDefault}
        />
      ) : tab === 'plans' && fields.length > 0 ? (
        <PlansPanel
          fields={fields}
          units={units}
          planGroups={planGroups}
          activeGroupId={activeGroupId}
          onViewGroup={onViewGroup}
          onCloseGroup={onCloseGroup}
          onCreateGroup={onCreateGroup}
          onDeleteGroup={onDeleteGroup}
          onDeleteStep={onDeleteStep}
          onCompleteStep={onCompleteStep}
          planDraft={planDraft}
          onStartStepDraft={onStartStepDraft}
          onCancelPlanDraft={onCancelPlanDraft}
          onSaveStepDraft={onSaveStepDraft}
          selectedIds={selectedIds}
        />
      ) : (
        <>
      {fields.length > 0 && !snapshot && (
        // Mode visibility: while selecting, the whole bar tints amber and the
        // exit is a loud yellow pill — the user always knows where they are.
        <div
          className={`px-4 py-2 border-b flex items-center justify-between gap-2 ${
            selectMode ? 'bg-accent/15 border-accent/40' : 'border-gray-100'
          }`}
        >
          <button
            type="button"
            onClick={onToggleSelectMode}
            className={`text-xs font-semibold rounded-full px-3 py-1 transition shadow-sm ${
              selectMode
                ? 'bg-accent text-primary-dark hover:bg-accent-dark'
                : 'bg-primary text-white hover:bg-primary-light'
            }`}
          >
            {selectMode ? 'Cancel ✕' : 'Select blocks'}
          </button>
          {selectMode && (
            <span className="text-xs text-gray-600">
              {selectedIds.size} selected
              {selectedIds.size > 0 && (
                <span className="text-primary font-semibold"> · {selectedArea.primary}</span>
              )}
            </span>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {fields.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            <p className="mb-2 font-semibold text-primary">No blocks yet</p>
            <p className="mb-4">Click the <strong>Draw a block</strong> button on the map to plot your first one.</p>
            <p className="text-xs text-gray-400">— or —</p>
            <Link href="/app/import" className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">
              Import your fields from another program →
            </Link>
          </div>
        ) : (
          groups.map((group) => {
            const groupAcres = group.fields.reduce((s, f) => s + Number(f.acreage_cached || 0), 0)
            const groupArea = formatArea(groupAcres, units)
            const plantationId = group.fields[0]?.plantation_id ?? null
            return (
              <div key={group.name || '__unassigned'}>
                <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur px-4 py-1.5 border-y border-gray-100 flex items-baseline justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wider font-bold text-gray-600 truncate">
                    {group.name || 'Unassigned'}
                  </span>
                  <span className="text-[11px] text-gray-400 shrink-0 flex items-center gap-2">
                    <span>{group.fields.length} · {groupArea.primary}</span>
                    {plantationId && !selectMode && (
                      <span className="flex items-center gap-4 pl-1">
                        {!isSpray && !snapshot && (
                          <button
                            type="button"
                            onClick={() => onRepositionPlantation(plantationId)}
                            className="text-primary font-semibold hover:underline"
                            title={`Move/rotate all of ${group.name} on the map`}
                          >
                            Move
                          </button>
                        )}
                        <a
                          href={snapshot ? `/snapshots/${snapshot.id}/print?plantation=${plantationId}` : `/plantations/${plantationId}/print${isSpray ? '?style=spray' : ''}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary font-semibold hover:underline"
                          title={isSpray ? `Print spray map of ${group.name}` : `Print ${group.name}`}
                        >
                          {isSpray ? 'Print spray map' : 'Print'}
                        </a>
                      </span>
                    )}
                  </span>
                </div>
                <ul className="divide-y divide-gray-100">
                  {group.fields.map((f) => {
                    const area = formatArea(f.acreage_cached, units)
                    const isHighlighted = f.id === selectedFieldId
                    const isChecked = selectedIds.has(f.id)
                    const rowClick = () => {
                      if (selectMode) onToggleFieldSelected(f.id)
                      else onSelectField(isHighlighted ? null : f.id)
                    }
                    return (
                      <li key={f.id} ref={isHighlighted ? selectedRef : undefined}>
                        <button
                          type="button"
                          onClick={rowClick}
                          className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-start gap-3 ${
                            !selectMode && isHighlighted ? 'bg-accent/10 border-l-4 border-accent' : ''
                          } ${selectMode && isChecked ? 'bg-primary/5' : ''}`}
                        >
                          {selectMode && (
                            <span
                              aria-hidden="true"
                              className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center ${
                                isChecked
                                  ? 'bg-primary border-primary text-white'
                                  : 'border-gray-300 bg-white'
                              }`}
                            >
                              {isChecked && (
                                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-8 8a1 1 0 01-1.42 0l-4-4a1 1 0 011.42-1.42L8 12.59l7.29-7.3a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-semibold text-primary text-sm truncate">{f.name}</span>
                              {(f.open_todo_count ?? 0) > 0 && (
                                <span
                                  title={`${f.open_todo_count} open to-do${f.open_todo_count === 1 ? '' : 's'}`}
                                  className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold bg-accent/20 text-primary-dark rounded-full pl-1 pr-1.5 py-0.5"
                                >
                                  <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                    <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-8 8a1 1 0 01-1.42 0l-4-4a1 1 0 011.42-1.42L8 12.59l7.29-7.3a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                  {f.open_todo_count}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{area.primary}</p>
                            {f.variety && (
                              <p className="text-xs text-gray-500">
                                {f.variety}
                                {f.current_ratoon && (
                                  <span className="text-gray-400">
                                    {' · '}
                                    {f.current_ratoon.replace(/_/g, ' ')}
                                  </span>
                                )}
                              </p>
                            )}
                            {f.notes && !selectMode && (
                              <p
                                className="text-[11px] text-gray-500 mt-1 leading-snug"
                                style={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}
                              >
                                {f.notes}
                              </p>
                            )}
                          </div>
                        </button>

                        {!selectMode && isHighlighted && !snapshot && (
                          <div className="px-4 pb-3 flex gap-2">
                            <a
                              href={`/app/fields/${f.id}`}
                              className="flex-1 text-center text-xs font-semibold bg-white border border-primary text-primary px-3 py-2 rounded-md hover:bg-primary/5"
                            >
                              Edit
                            </a>
                            <a
                              href={`/fields/${f.id}/print`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 text-center text-xs font-semibold bg-primary text-white px-3 py-2 rounded-md hover:bg-primary-light"
                            >
                              Print
                            </a>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })
        )}
      </div>

      {selectMode && selectedIds.size > 0 && (
        <div className="border-t border-gray-100 bg-white p-3 space-y-2 max-h-[55vh] overflow-y-auto">
          <div className="flex items-baseline justify-between px-1">
            <span className="text-sm font-semibold text-primary">
              {selectedIds.size} block{selectedIds.size === 1 ? '' : 's'} selected
            </span>
            <span className="text-sm font-bold text-primary">{selectedArea.primary}</span>
          </div>
          {logOpen ? (
            <BulkLogPanel
              blockIds={Array.from(selectedIds)}
              title={`Log an operation for ${selectedIds.size} block${selectedIds.size === 1 ? '' : 's'}`}
              onDone={(summary) => {
                setLogOpen(false)
                setLogSuccess(summary)
                setTimeout(() => setLogSuccess(null), 4000)
              }}
              onCancel={() => setLogOpen(false)}
            />
          ) : assignView === 'menu' ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-primary">
                Assign {selectedIds.size} block{selectedIds.size === 1 ? '' : 's'} to…
              </p>
              {(
                [
                  ['plantation', 'Plantation…'],
                  ['cycle', 'Cycle / year cane…'],
                  ['variety', 'Variety…'],
                ] as const
              ).map(([view, label]) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setAssignView(view)}
                  className="w-full text-left text-sm font-semibold rounded-md border border-gray-200 text-primary px-3 py-2 hover:bg-primary/5"
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAssignView(null)}
                className="text-xs text-gray-500 hover:text-primary w-full text-center pt-1"
              >
                Cancel
              </button>
            </div>
          ) : assignView === 'plantation' ? (
            <AssignToPlantationPanel
              onCancel={() => setAssignView('menu')}
              onAssign={async (plantationId) => {
                await onBulkAssignPlantation(plantationId)
                setAssignView(null)
              }}
            />
          ) : assignView === 'cycle' ? (
            <AssignCyclePanel
              count={selectedIds.size}
              stageColors={stageColors}
              onCancel={() => setAssignView('menu')}
              onPick={async (cycle) => {
                await onBulkEdit({ cycle })
                setAssignView(null)
              }}
            />
          ) : assignView === 'variety' ? (
            <AssignVarietyPanel
              count={selectedIds.size}
              varieties={Array.from(
                new Set(fields.flatMap((f) => (f.variety ? [f.variety.trim()] : []))),
              ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))}
              onCancel={() => setAssignView('menu')}
              onPick={async (variety) => {
                await onBulkEdit({ variety })
                setAssignView(null)
              }}
            />
          ) : deleteOpen ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-red-800">
                Are you sure you want to DELETE the {selectedIds.size} selected block
                {selectedIds.size === 1 ? '' : 's'}?
              </p>
              <p className="text-xs text-red-700 leading-relaxed">
                They come off the map and out of every list. Past records (harvests,
                sprays, history) stay in your operations log. No bulk undo.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true)
                    try {
                      await onBulkDelete()
                    } finally {
                      setDeleting(false)
                      setDeleteOpen(false)
                    }
                  }}
                  className="text-xs font-semibold rounded-md bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteOpen(false)}
                  className="text-xs text-gray-600 hover:text-primary"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : rotateOpen ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-amber-900">
                Roll {selectedIds.size} block{selectedIds.size === 1 ? '' : 's'} forward one year cane?
              </p>
              <p className="text-xs text-amber-800 leading-relaxed">
                Each moves to its next cut — plant cane → 1st stubble, 1st → 2nd, and so on through
                6th. Blocks that are fallow, already 6th+, or have no cut set stay put. No bulk undo.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={rotating}
                  onClick={async () => {
                    setRotating(true)
                    await onBulkRotate()
                    setRotating(false)
                    setRotateOpen(false)
                  }}
                  className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  {rotating ? 'Rotating…' : 'Yes, rotate'}
                </button>
                <button
                  type="button"
                  disabled={rotating}
                  onClick={() => setRotateOpen(false)}
                  className="text-xs text-gray-600 hover:text-primary"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Spray map is view-and-print only — hide the editing actions
                  (assign / rotate / move) and leave just the spray-map export. */}
              {logSuccess && (
                <p className="text-xs font-semibold text-green-800 bg-green-50 border border-green-100 rounded px-2 py-1.5">
                  ✓ {logSuccess}
                </p>
              )}
              {!isSpray && (
                <>
                  <button
                    type="button"
                    onClick={() => setLogOpen(true)}
                    className="btn-primary w-full text-sm"
                  >
                    Log operation for {selectedIds.size}…
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignView('menu')}
                    className="w-full text-sm font-semibold rounded-md border-2 border-primary text-primary px-3 py-2 hover:bg-primary/5"
                  >
                    Assign {selectedIds.size} to…
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotateOpen(true)}
                    className="w-full text-sm font-semibold rounded-md border-2 border-primary text-primary px-3 py-2 hover:bg-primary/5"
                  >
                    Rotate {selectedIds.size} to next cycle →
                  </button>
                  <button
                    type="button"
                    onClick={onStartReposition}
                    className="w-full text-sm font-semibold rounded-md border-2 border-primary text-primary px-3 py-2 hover:bg-primary/5"
                  >
                    Move / rotate {selectedIds.size} on map →
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    className="w-full text-sm font-semibold rounded-md border-2 border-red-200 text-red-700 px-3 py-2 hover:bg-red-50"
                  >
                    Delete {selectedIds.size} block{selectedIds.size === 1 ? '' : 's'}…
                  </button>
                </>
              )}
              {/* No "print selected blocks" here — a handful of lone blocks
                  with no surrounding context isn't a useful printout. Context
                  prints come from the Layers tab (whole plantations/stages)
                  and per-plantation print. */}
            </>
          )}
        </div>
      )}
        </>
      )}
    </aside>
  )
}

// ── Bulk-assign cycle (year cane) panel ────────────────────────────────

function AssignCyclePanel({
  count,
  stageColors,
  onCancel,
  onPick,
}: {
  count: number
  stageColors: import('@/lib/resolve-colors').StageColor[]
  onCancel: () => void
  onPick: (cycle: string | null) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const pick = async (cycle: string | null) => {
    setSaving(true)
    try {
      await onPick(cycle)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-primary">
        Set the cycle on {count} block{count === 1 ? '' : 's'}
      </p>
      <div className="max-h-44 overflow-y-auto space-y-1">
        {stageColors.map((st) => (
          <button
            key={st.key}
            type="button"
            disabled={saving}
            onClick={() => pick(st.key)}
            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-primary/5 text-primary font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <span
              aria-hidden="true"
              className="w-3 h-3 rounded-sm border border-black/10 shrink-0"
              style={{ backgroundColor: st.color }}
            />
            {st.label}
          </button>
        ))}
        <button
          type="button"
          disabled={saving}
          onClick={() => pick(null)}
          className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-100 text-gray-700 disabled:opacity-50"
        >
          — Clear cycle (no cut set)
        </button>
      </div>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="text-xs text-gray-500 hover:text-primary w-full text-center pt-1"
      >
        {saving ? 'Saving…' : '← Back'}
      </button>
    </div>
  )
}

// ── Bulk-assign variety panel ──────────────────────────────────────────

function AssignVarietyPanel({
  count,
  varieties,
  onCancel,
  onPick,
}: {
  count: number
  varieties: string[]
  onCancel: () => void
  onPick: (variety: string | null) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [newVariety, setNewVariety] = useState('')
  const pick = async (variety: string | null) => {
    setSaving(true)
    try {
      await onPick(variety)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-primary">
        Set the variety on {count} block{count === 1 ? '' : 's'}
      </p>
      {varieties.length > 0 && (
        <div className="max-h-40 overflow-y-auto space-y-1">
          {varieties.map((v) => (
            <button
              key={v}
              type="button"
              disabled={saving}
              onClick={() => pick(v)}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-primary/5 text-primary font-semibold disabled:opacity-50"
            >
              {v}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2 pt-2 border-t border-gray-100">
        <input
          type="text"
          value={newVariety}
          onChange={(e) => setNewVariety(e.target.value)}
          maxLength={50}
          placeholder={varieties.length ? 'Or type a new variety' : 'Variety (e.g. L 01-299)'}
          className="flex-1 input text-xs py-1.5"
          disabled={saving}
        />
        <button
          type="button"
          onClick={() => newVariety.trim() && pick(newVariety.trim())}
          disabled={saving || !newVariety.trim()}
          className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
        >
          {saving ? '…' : 'Set'}
        </button>
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={() => pick(null)}
        className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-100 text-gray-700 disabled:opacity-50"
      >
        — Clear variety
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="text-xs text-gray-500 hover:text-primary w-full text-center pt-1"
      >
        ← Back
      </button>
    </div>
  )
}

// ── Bulk-assign plantation panel ───────────────────────────────────────
// Fetches plantations lazily when opened so the sidebar doesn't have to thread
// plantation data through on every render.

function AssignToPlantationPanel({
  onCancel,
  onAssign,
}: {
  onCancel: () => void
  onAssign: (plantationId: string | null) => Promise<void>
}) {
  const [plantations, setPlantations] = useState<Plantation[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/plantations')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setPlantations((data.plantations ?? []) as Plantation[])
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(friendlyError(e))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function createAndAssign() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/plantations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to create plantation')
      }
      const { id } = await res.json()
      await onAssign(id)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-primary">Assign to…</p>
      {loading && <p className="text-xs text-gray-500">Loading plantations…</p>}
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
          {error}
        </p>
      )}
      {!loading && (
        <div className="max-h-40 overflow-y-auto space-y-1">
          <button
            type="button"
            onClick={() => onAssign(null)}
            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-100 text-gray-700"
          >
            — Unassigned
          </button>
          {plantations?.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onAssign(s.id)}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-primary/5 text-primary font-semibold"
            >
              {s.name}
            </button>
          ))}
          {plantations?.length === 0 && (
            <p className="text-xs text-gray-500 px-2 py-1">No plantations yet — create one below.</p>
          )}
        </div>
      )}
      <div className="flex gap-2 pt-2 border-t border-gray-100">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={100}
          placeholder="New plantation name"
          className="flex-1 input text-xs py-1.5"
          disabled={creating}
        />
        <button
          type="button"
          onClick={createAndAssign}
          disabled={creating || !newName.trim()}
          className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
        >
          {creating ? '…' : 'Create'}
        </button>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-gray-500 hover:text-primary w-full text-center pt-1"
      >
        Cancel
      </button>
      <p className="text-[11px] text-gray-400">
        Manage plantations at <Link href="/app/plantations" className="hover:underline">/app/plantations</Link>
      </p>
    </div>
  )
}
