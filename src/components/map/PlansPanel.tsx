'use client'

import { useMemo, useState } from 'react'
import type { FieldRow } from '@/lib/fields'
import type { PlanGroupRow } from '@/lib/fly-plans'
import type { Units } from '@/lib/types'
import { formatArea } from '@/lib/units'
import BulkLogPanel from './BulkLogPanel'

// The Plans tab — a plan is a SET of colored steps that communicate: "Ripener
// Program" holds "First Fly" purple on these blocks, "Second Fly" blue on
// those. While picking blocks for the next step, blocks already in earlier
// steps show locked in their colors, so what's left is always obvious. The
// whole plan views as one multi-color map, prints as a master sheet plus one
// sheet per step, and sits in the Layers tab as its own layer.
const PLAN_COLORS = ['#7C3AED', '#2563EB', '#EAB308', '#16A34A', '#DC2626', '#EA580C']

export default function PlansPanel({
  fields,
  units,
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
  selectedIds,
}: {
  fields: FieldRow[]
  units: Units
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
  selectedIds: Set<string>
}) {
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  // Which group's "add step" form is open, and its fields.
  const [addStepGroupId, setAddStepGroupId] = useState<string | null>(null)
  const [stepName, setStepName] = useState('')
  const [stepColor, setStepColor] = useState(PLAN_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmDeleteStep, setConfirmDeleteStep] = useState<string | null>(null)
  const [logStepId, setLogStepId] = useState<string | null>(null)
  const [logDoneName, setLogDoneName] = useState<string | null>(null)

  const byId = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields])
  const areaOf = (ids: string[]) =>
    formatArea(
      ids.reduce((s, id) => s + Number(byId.get(id)?.acreage_cached || 0), 0),
      units,
    )
  const liveCount = (ids: string[]) => ids.filter((id) => byId.has(id)).length

  const draftGroup = planDraft ? (planGroups.find((g) => g.id === planDraft.groupId) ?? null) : null
  const draftLockedCount = draftGroup
    ? draftGroup.steps.reduce((s, st) => s + liveCount(st.block_ids), 0)
    : 0
  const draftArea = areaOf(Array.from(selectedIds))

  // Next unused palette color for a group — "First Fly" purple, "Second Fly"
  // blue, without the grower having to think about it (still overridable).
  const nextColorFor = (g: PlanGroupRow) => {
    const used = new Set(g.steps.map((s) => s.color.toUpperCase()))
    return PLAN_COLORS.find((c) => !used.has(c.toUpperCase())) ?? PLAN_COLORS[g.steps.length % PLAN_COLORS.length]
  }

  const openAddStep = (g: PlanGroupRow) => {
    setAddStepGroupId(g.id)
    setStepName('')
    setStepColor(nextColorFor(g))
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Drafting: picking this step's blocks on the map right now. */}
      {planDraft ? (
        <div className="p-3 m-3 rounded-md border-2 border-primary bg-primary/5 space-y-2">
          <p className="text-xs font-semibold text-gray-500 truncate">
            {draftGroup?.name ?? 'Plan'} — new step
          </p>
          <p className="text-sm font-semibold text-primary flex items-center gap-2">
            <span
              aria-hidden="true"
              className="w-3.5 h-3.5 rounded-sm border border-black/10"
              style={{ background: planDraft.color }}
            />
            {planDraft.name}
          </p>
          <p className="text-xs text-gray-600 leading-snug">
            Tap the blocks for this step — tap again to remove one.
            {draftLockedCount > 0 && (
              <> Blocks already in this plan&rsquo;s other steps show in their colors and are locked.</>
            )}
          </p>
          <p className="text-sm font-bold text-primary">
            {selectedIds.size} block{selectedIds.size === 1 ? '' : 's'} · {draftArea.primary}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedIds.size === 0 || saving}
              onClick={async () => {
                setSaving(true)
                const ok = await onSaveStepDraft()
                setSaving(false)
                if (ok) setAddStepGroupId(null)
              }}
              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save step'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onCancelPlanDraft}
              className="text-xs text-gray-600 hover:text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {newOpen ? (
            <div className="p-3 m-3 rounded-md border border-gray-200 space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={100}
                placeholder="Plan name — Ripener program"
                className="input text-sm w-full"
                autoFocus
              />
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={!newName.trim() || creating}
                  onClick={async () => {
                    setCreating(true)
                    const id = await onCreateGroup(newName.trim())
                    setCreating(false)
                    if (id) {
                      setNewOpen(false)
                      setNewName('')
                      // Straight into the first step.
                      setAddStepGroupId(id)
                      setStepName('')
                      setStepColor(PLAN_COLORS[0])
                    }
                  }}
                  className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create plan'}
                </button>
                <button
                  type="button"
                  onClick={() => setNewOpen(false)}
                  className="text-xs text-gray-600 hover:text-primary"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-3">
              <button type="button" onClick={() => setNewOpen(true)} className="btn-primary text-sm w-full">
                + New plan
              </button>
            </div>
          )}
          {logDoneName && (
            <p className="mx-4 mt-1 mb-2 text-xs font-semibold text-green-800 bg-green-50 border border-green-100 rounded px-2 py-1.5">
              ✓ Work logged on every block in &ldquo;{logDoneName}&rdquo; — the record is on the
              Operations page.
            </p>
          )}
          {planGroups.length === 0 && !newOpen && (
            <p className="text-xs text-gray-500 leading-snug px-4 pt-3">
              A plan is a set of colored steps that work together — five spray flies, a
              fertilizer program, a harvest order. Each step gets its own color and blocks;
              while picking the next step&rsquo;s blocks, the earlier steps stay on the map in
              their colors so you always see what&rsquo;s left. View or print the whole plan as
              one map, and find it under Layers → Plans.
            </p>
          )}
          <ul className="divide-y divide-gray-100">
            {planGroups.map((g) => {
              const viewing = activeGroupId === g.id
              const allIds = g.steps.flatMap((s) => s.block_ids)
              const total = liveCount(allIds)
              const done = g.steps.filter((s) => s.completed_at).length
              return (
                <li key={g.id} className={viewing ? 'bg-primary/5' : ''}>
                  <div className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => (viewing ? onCloseGroup() : onViewGroup(g.id))}
                      className="w-full text-left flex items-center gap-3"
                    >
                      <span aria-hidden="true" className="flex -space-x-0.5 flex-shrink-0">
                        {g.steps.slice(0, 5).map((st) => (
                          <span
                            key={st.id}
                            className="w-3 h-3.5 border border-black/10 first:rounded-l-sm last:rounded-r-sm"
                            style={{ background: st.color }}
                          />
                        ))}
                        {g.steps.length === 0 && (
                          <span className="w-3 h-3.5 rounded-sm border border-dashed border-gray-300" />
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-gray-800 truncate">
                          {g.name}
                          {g.completed_at && (
                            <span className="ml-1.5 text-[10px] font-bold text-green-700">
                              ✓ done
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {g.steps.length} step{g.steps.length === 1 ? '' : 's'} · {total} block
                          {total === 1 ? '' : 's'} · {areaOf(allIds).primary}
                          {g.steps.length > 0 && done > 0 && !g.completed_at && (
                            <> · {done}/{g.steps.length} logged</>
                          )}
                        </span>
                      </span>
                    </button>
                    <span className="mt-1.5 flex items-center gap-4 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => (viewing ? onCloseGroup() : onViewGroup(g.id))}
                        className="text-primary hover:underline"
                      >
                        {viewing ? 'Close' : 'View'}
                      </button>
                      {g.steps.length > 0 && (
                        <a
                          href={`/plan-groups/${g.id}/print`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          Print
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => openAddStep(g)}
                        className="text-primary hover:underline"
                      >
                        + Add step
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(g.id)}
                        className="text-red-700 hover:underline"
                      >
                        Delete
                      </button>
                    </span>
                  </div>

                  {addStepGroupId === g.id && (
                    <div className="mx-4 mb-2.5 p-2.5 rounded-md border border-gray-200 space-y-2">
                      <input
                        type="text"
                        value={stepName}
                        onChange={(e) => setStepName(e.target.value)}
                        maxLength={100}
                        placeholder={`Step name — ${g.steps.length === 0 ? 'First fly' : `Fly ${g.steps.length + 1}`}`}
                        className="input text-sm w-full"
                        autoFocus
                      />
                      <div className="flex items-center gap-1.5">
                        {PLAN_COLORS.map((c) => {
                          const used = g.steps.some((st) => st.color.toUpperCase() === c.toUpperCase())
                          return (
                            <button
                              key={c}
                              type="button"
                              aria-label={`Use color ${c}`}
                              onClick={() => setStepColor(c)}
                              className={`w-7 h-7 rounded-md border-2 ${
                                stepColor === c ? 'border-primary' : 'border-transparent'
                              } ${used ? 'opacity-30' : ''}`}
                              style={{ background: c }}
                              title={used ? 'Already used by another step' : undefined}
                            />
                          )
                        })}
                        <label className="relative w-7 h-7 rounded-md border border-dashed border-gray-400 cursor-pointer overflow-hidden">
                          <input
                            type="color"
                            value={stepColor}
                            onChange={(e) => setStepColor(e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            aria-label="Custom color"
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
                            +
                          </span>
                        </label>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={!stepName.trim()}
                          onClick={() =>
                            onStartStepDraft({
                              groupId: g.id,
                              name: stepName.trim(),
                              color: stepColor,
                            })
                          }
                          className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                        >
                          Pick blocks on map →
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddStepGroupId(null)}
                          className="text-xs text-gray-600 hover:text-primary"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Steps */}
                  {g.steps.length > 0 && (
                    <ul className="pb-1.5">
                      {g.steps.map((st) => {
                        const count = liveCount(st.block_ids)
                        return (
                          <li key={st.id} className="pl-8 pr-4 py-1.5">
                            <div className="flex items-center gap-2.5">
                              <span
                                aria-hidden="true"
                                className="w-3 h-3 rounded-sm flex-shrink-0 border border-black/10"
                                style={{ background: st.color }}
                              />
                              <span className="flex-1 min-w-0">
                                <span className="block text-[13px] font-medium text-gray-800 truncate">
                                  {st.name}
                                  {st.completed_at && (
                                    <span className="ml-1.5 text-[10px] font-bold text-green-700">
                                      ✓
                                    </span>
                                  )}
                                </span>
                                <span className="block text-[11px] text-gray-500">
                                  {count} block{count === 1 ? '' : 's'} · {areaOf(st.block_ids).primary}
                                </span>
                              </span>
                              <span className="flex items-center gap-3 text-[11px] font-semibold shrink-0">
                                <a
                                  href={`/fly-plans/${st.id}/print`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  Print
                                </a>
                                {!st.completed_at && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLogDoneName(null)
                                      setLogStepId(logStepId === st.id ? null : st.id)
                                    }}
                                    className="text-primary hover:underline"
                                  >
                                    Log work
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteStep(st.id)}
                                  className="text-red-700 hover:underline"
                                >
                                  Delete
                                </button>
                              </span>
                            </div>
                            {logStepId === st.id && (
                              <div className="mt-2">
                                <BulkLogPanel
                                  blockIds={st.block_ids.filter((id) => byId.has(id))}
                                  title={`Log work — ${st.name} (${count} blocks)`}
                                  lockKind="application"
                                  eventColor={st.color}
                                  eventContext={`${g.name} — ${st.name}`}
                                  onDone={async () => {
                                    setLogStepId(null)
                                    await onCompleteStep(st.id)
                                    setLogDoneName(`${g.name} — ${st.name}`)
                                    setTimeout(() => setLogDoneName(null), 8000)
                                  }}
                                  onCancel={() => setLogStepId(null)}
                                />
                              </div>
                            )}
                            {confirmDeleteStep === st.id && (
                              <div className="mt-1.5 flex items-center gap-3 text-xs">
                                <span className="text-red-800 font-semibold">
                                  Delete step &ldquo;{st.name}&rdquo;?
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await onDeleteStep(st.id)
                                    setConfirmDeleteStep(null)
                                  }}
                                  className="text-red-700 font-bold hover:underline"
                                >
                                  Yes, delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteStep(null)}
                                  className="text-gray-600 hover:text-primary"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {confirmDelete === g.id && (
                    <div className="px-4 pb-2.5 flex items-center gap-3 text-xs">
                      <span className="text-red-800 font-semibold">
                        Delete &ldquo;{g.name}&rdquo; and all {g.steps.length} step
                        {g.steps.length === 1 ? '' : 's'}?
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await onDeleteGroup(g.id)
                          setConfirmDelete(null)
                        }}
                        className="text-red-700 font-bold hover:underline"
                      >
                        Yes, delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="text-gray-600 hover:text-primary"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
