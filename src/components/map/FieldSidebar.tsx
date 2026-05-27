'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { FieldRow } from '@/lib/fields'
import type { Section, Units } from '@/lib/types'
import { formatArea } from '@/lib/units'

interface FieldSidebarProps {
  fields: FieldRow[]
  units: Units
  selectedFieldId: string | null
  onSelectField: (id: string | null) => void
  totalAcres: number
  onClose?: () => void
  // Bulk-select mode (for assigning sections to many fields at once).
  selectMode: boolean
  selectedIds: Set<string>
  onToggleSelectMode: () => void
  onToggleFieldSelected: (id: string) => void
  // sectionId: pass a UUID to assign, or null to unassign.
  onBulkAssignSection: (sectionId: string | null) => Promise<void>
  onBulkRotate: () => Promise<{ advanced: number; skipped: number } | null>
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
  onBulkAssignSection,
  onBulkRotate,
}: FieldSidebarProps) {
  const total = formatArea(totalAcres, units)
  const [assignOpen, setAssignOpen] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)
  const [rotating, setRotating] = useState(false)

  return (
    <aside className="w-72 border-r border-gray-100 bg-white flex flex-col shadow-xl md:shadow-none">
      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
            Fields
          </p>
          <p className="text-2xl font-bold text-primary mt-1">{fields.length}</p>
          <p className="text-xs text-gray-500">
            Total: <span className="font-semibold text-gray-700">{total.primary}</span>
            {fields.length > 0 && <span className="text-gray-400"> · {total.alt}</span>}
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
            {selectMode ? 'Done' : 'Select fields'}
          </button>
          {selectMode && (
            <span className="text-xs text-gray-500">
              {selectedIds.size} selected
            </span>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {fields.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            <p className="mb-2 font-semibold text-primary">No fields yet</p>
            <p>Click the <strong>Draw a field</strong> button on the map to plot your first one.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {fields.map((f) => {
              const area = formatArea(f.acreage_cached, units)
              const isHighlighted = f.id === selectedFieldId
              const isChecked = selectedIds.has(f.id)
              const rowClick = () => {
                if (selectMode) onToggleFieldSelected(f.id)
                else onSelectField(isHighlighted ? null : f.id)
              }
              return (
                <li key={f.id}>
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
                      <p className="font-semibold text-primary text-sm truncate">{f.name}</p>
                      {f.section_name && (
                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mt-0.5">
                          {f.section_name}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-0.5">
                        {area.primary}
                        <span className="text-gray-400"> · {area.alt}</span>
                      </p>
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
        )}
      </div>

      {selectMode && selectedIds.size > 0 && (
        <div className="border-t border-gray-100 bg-white p-3 space-y-2">
          {assignOpen ? (
            <AssignToSectionPanel
              onCancel={() => setAssignOpen(false)}
              onAssign={async (sectionId) => {
                await onBulkAssignSection(sectionId)
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
                Assign {selectedIds.size} to section…
              </button>
              <button
                type="button"
                onClick={() => setRotateOpen(true)}
                className="w-full text-sm font-semibold rounded-md border-2 border-primary text-primary px-3 py-2 hover:bg-primary/5"
              >
                Rotate {selectedIds.size} to next cycle →
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  )
}

// ── Bulk-assign section panel ───────────────────────────────────────
// Fetches sections lazily when opened so the sidebar doesn't have to thread
// section data through on every render.

function AssignToSectionPanel({
  onCancel,
  onAssign,
}: {
  onCancel: () => void
  onAssign: (sectionId: string | null) => Promise<void>
}) {
  const [sections, setSections] = useState<Section[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/sections')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setSections((data.sections ?? []) as Section[])
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
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
      const res = await fetch('/api/sections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to create section')
      }
      const { id } = await res.json()
      await onAssign(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-primary">Assign to…</p>
      {loading && <p className="text-xs text-gray-500">Loading sections…</p>}
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
          {sections?.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onAssign(s.id)}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-primary/5 text-primary font-semibold"
            >
              {s.name}
            </button>
          ))}
          {sections?.length === 0 && (
            <p className="text-xs text-gray-500 px-2 py-1">No sections yet — create one below.</p>
          )}
        </div>
      )}
      <div className="flex gap-2 pt-2 border-t border-gray-100">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={100}
          placeholder="New section name"
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
        Manage sections at <Link href="/app/sections" className="hover:underline">/app/sections</Link>
      </p>
    </div>
  )
}
