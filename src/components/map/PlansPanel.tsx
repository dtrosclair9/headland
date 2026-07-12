'use client'

import { useMemo, useState } from 'react'
import type { FieldRow } from '@/lib/fields'
import type { FlyPlanRow } from '@/lib/fly-plans'
import type { Units } from '@/lib/types'
import { formatArea } from '@/lib/units'
import BulkLogPanel from './BulkLogPanel'

// The Plans tab — named, colored block selections for any job: a pilot's
// spray pass, a fertilizer run, a harvest order. "1st spray" = red on these
// blocks, "2nd spray" = yellow on those. Viewing a plan paints only its
// blocks (in the plan color) on the white map; printing hands out the same
// sheet per plantation; Log work records the plan as done on every block.
const PLAN_COLORS = ['#DC2626', '#EAB308', '#2563EB', '#16A34A', '#EA580C', '#7C3AED']

export default function PlansPanel({
  fields,
  units,
  flyPlans,
  activePlanId,
  onViewPlan,
  onClosePlan,
  onDeletePlan,
  planDraft,
  onStartPlanDraft,
  onCancelPlanDraft,
  onSavePlanDraft,
  selectedIds,
}: {
  fields: FieldRow[]
  units: Units
  flyPlans: FlyPlanRow[]
  activePlanId: string | null
  onViewPlan: (id: string) => void
  onClosePlan: () => void
  onDeletePlan: (id: string) => Promise<void>
  planDraft: { name: string; color: string } | null
  onStartPlanDraft: (draft: { name: string; color: string }) => void
  onCancelPlanDraft: () => void
  onSavePlanDraft: () => Promise<boolean>
  selectedIds: Set<string>
}) {
  const [newOpen, setNewOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(PLAN_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  // "Log work" — bulk-log an application across every block in the plan.
  const [logPlanId, setLogPlanId] = useState<string | null>(null)
  const [logDone, setLogDone] = useState<string | null>(null)

  const byId = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields])
  const planStats = (p: FlyPlanRow) => {
    const live = p.block_ids.filter((id) => byId.has(id))
    const acres = live.reduce((s, id) => s + Number(byId.get(id)!.acreage_cached || 0), 0)
    return { count: live.length, area: formatArea(acres, units) }
  }
  const draftAcres = formatArea(
    Array.from(selectedIds).reduce((s, id) => s + Number(byId.get(id)?.acreage_cached || 0), 0),
    units,
  )

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Drafting: picking blocks on the map right now. */}
      {planDraft ? (
        <div className="p-3 m-3 rounded-md border-2 border-primary bg-primary/5 space-y-2">
          <p className="text-sm font-semibold text-primary flex items-center gap-2">
            <span
              aria-hidden="true"
              className="w-3.5 h-3.5 rounded-sm border border-black/10"
              style={{ background: planDraft.color }}
            />
            {planDraft.name}
          </p>
          <p className="text-xs text-gray-600 leading-snug">
            Tap the blocks for this plan on the map — tap again to remove one.
          </p>
          <p className="text-sm font-bold text-primary">
            {selectedIds.size} block{selectedIds.size === 1 ? '' : 's'} · {draftAcres.primary}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedIds.size === 0 || saving}
              onClick={async () => {
                setSaving(true)
                const ok = await onSavePlanDraft()
                setSaving(false)
                if (ok) {
                  setNewOpen(false)
                  setName('')
                }
              }}
              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save plan'}
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
          {flyPlans.length === 0 && !newOpen && (
            <p className="text-xs text-gray-500 leading-snug px-4 pt-3">
              A plan is a named set of blocks with its own color — a spray pass for the pilot, a
              fertilizer run, a harvest order. Build it once, view it on the white map, print a
              sheet per plantation, then log the work on every block in one tap.
            </p>
          )}
          <ul className="divide-y divide-gray-50">
            {flyPlans.map((p) => {
              const stats = planStats(p)
              const viewing = activePlanId === p.id
              return (
                <li key={p.id} className={viewing ? 'bg-primary/5' : ''}>
                  <div className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => (viewing ? onClosePlan() : onViewPlan(p.id))}
                      className="w-full text-left flex items-center gap-3"
                    >
                      <span
                        aria-hidden="true"
                        className="w-3.5 h-3.5 rounded-sm flex-shrink-0 border border-black/10"
                        style={{ background: p.color }}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-gray-800 truncate">
                          {p.name}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {stats.count} block{stats.count === 1 ? '' : 's'} · {stats.area.primary}
                        </span>
                      </span>
                    </button>
                    {/* Actions on their own row — four of them overflow inline. */}
                    <span className="mt-1.5 pl-[26px] flex items-center gap-4 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => (viewing ? onClosePlan() : onViewPlan(p.id))}
                        className="text-primary hover:underline"
                      >
                        {viewing ? 'Close' : 'View'}
                      </button>
                      <a
                        href={`/fly-plans/${p.id}/print`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        Print
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setLogDone(null)
                          setLogPlanId(logPlanId === p.id ? null : p.id)
                        }}
                        className="text-primary hover:underline"
                      >
                        Log work
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(p.id)}
                        className="text-red-700 hover:underline"
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                  {logDone === p.id && (
                    <p className="mx-4 mb-2.5 text-xs font-semibold text-green-800 bg-green-50 border border-green-100 rounded px-2 py-1.5">
                      ✓ Work logged on every block in &ldquo;{p.name}&rdquo; — it&apos;s on the
                      Operations page now.
                    </p>
                  )}
                  {logPlanId === p.id && (
                    <div className="px-4 pb-3">
                      <BulkLogPanel
                        blockIds={p.block_ids.filter((id) => byId.has(id))}
                        title={`Log work — ${p.name} (${planStats(p).count} blocks)`}
                        lockKind="application"
                        eventColor={p.color}
                        eventContext={p.name}
                        onDone={() => {
                          setLogPlanId(null)
                          setLogDone(p.id)
                          setTimeout(() => setLogDone(null), 6000)
                        }}
                        onCancel={() => setLogPlanId(null)}
                      />
                    </div>
                  )}
                  {confirmDelete === p.id && (
                    <div className="px-4 pb-2.5 flex items-center gap-3 text-xs">
                      <span className="text-red-800 font-semibold">Delete &ldquo;{p.name}&rdquo;?</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await onDeletePlan(p.id)
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

          {newOpen ? (
            <div className="p-3 m-3 rounded-md border border-gray-200 space-y-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="Plan name — 1st spray"
                className="input text-sm w-full"
                autoFocus
              />
              <div className="flex items-center gap-1.5">
                {PLAN_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Use color ${c}`}
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-md border-2 ${
                      color === c ? 'border-primary' : 'border-transparent'
                    }`}
                    style={{ background: c }}
                  />
                ))}
                <label className="relative w-7 h-7 rounded-md border border-dashed border-gray-400 cursor-pointer overflow-hidden">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
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
                  disabled={!name.trim()}
                  onClick={() => onStartPlanDraft({ name: name.trim(), color })}
                  className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  Pick blocks on map →
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
        </>
      )}
    </div>
  )
}
