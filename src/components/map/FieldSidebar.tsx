'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FieldRow } from '@/lib/fields'
import type { Plantation, Units } from '@/lib/types'
import { formatArea } from '@/lib/units'
import { friendlyError } from '@/lib/errors'

interface FieldSidebarProps {
  fields: FieldRow[]
  units: Units
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
  onBulkRotate: () => Promise<{ advanced: number; skipped: number } | null>
  // Reposition (move/rotate) the currently-selected blocks on the map.
  onStartReposition: () => void
  // Reposition a whole plantation's blocks at once (the "farm drifted as a unit" case).
  onRepositionPlantation: (plantationId: string) => void
}

export default function FieldSidebar({
  fields,
  units,
  selectedFieldId,
  onSelectField,
  totalAcres,
  onClose,
  selectMode,
  selectedIds,
  onToggleSelectMode,
  onToggleFieldSelected,
  onBulkAssignPlantation,
  onBulkRotate,
  onStartReposition,
  onRepositionPlantation,
}: FieldSidebarProps) {
  const total = formatArea(totalAcres, units)
  // Combined acreage of the bulk-selected blocks (live as you tap blocks).
  const selectedArea = useMemo(
    () =>
      formatArea(
        fields.reduce((s, f) => (selectedIds.has(f.id) ? s + Number(f.acreage_cached || 0) : s), 0),
        units,
      ),
    [fields, selectedIds, units],
  )
  const [assignOpen, setAssignOpen] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)
  const [rotating, setRotating] = useState(false)

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
    if (selectedFieldId) selectedRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [selectedFieldId])

  return (
    <aside className="w-72 border-r border-gray-100 bg-white flex flex-col shadow-xl md:shadow-none">
      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
            Blocks
          </p>
          <p className="text-2xl font-bold text-primary mt-1">{fields.length}</p>
          <p className="text-xs text-gray-500">
            Total: <span className="font-semibold text-gray-700">{total.primary}</span>
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close fields panel"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-primary"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {fields.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onToggleSelectMode}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {selectMode ? 'Done' : 'Select blocks'}
          </button>
          {selectMode && (
            <span className="text-xs text-gray-500">
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
                        <button
                          type="button"
                          onClick={() => onRepositionPlantation(plantationId)}
                          className="text-primary font-semibold hover:underline"
                          title={`Move/rotate all of ${group.name} on the map`}
                        >
                          Move
                        </button>
                        <a
                          href={`/plantations/${plantationId}/print`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary font-semibold hover:underline"
                          title={`Print ${group.name}`}
                        >
                          Print
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

                        {!selectMode && isHighlighted && (
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
        <div className="border-t border-gray-100 bg-white p-3 space-y-2">
          <div className="flex items-baseline justify-between px-1">
            <span className="text-sm font-semibold text-primary">
              {selectedIds.size} block{selectedIds.size === 1 ? '' : 's'} selected
            </span>
            <span className="text-sm font-bold text-primary">{selectedArea.primary}</span>
          </div>
          {assignOpen ? (
            <AssignToPlantationPanel
              onCancel={() => setAssignOpen(false)}
              onAssign={async (plantationId) => {
                await onBulkAssignPlantation(plantationId)
                setAssignOpen(false)
              }}
            />
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
              <button
                type="button"
                onClick={() => setAssignOpen(true)}
                className="btn-primary w-full text-sm"
              >
                Assign {selectedIds.size} to plantation…
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
              <a
                href={`/blocks/print?ids=${Array.from(selectedIds).join(',')}`}
                target="_blank"
                rel="noreferrer"
                className="block text-center w-full text-sm font-semibold rounded-md border-2 border-primary text-primary px-3 py-2 hover:bg-primary/5"
              >
                Print {selectedIds.size} selected →
              </a>
            </>
          )}
        </div>
      )}
    </aside>
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
