'use client'

import { useMemo, useState } from 'react'
import type { FieldRow } from '@/lib/fields'
import type { FlyPlanRow } from '@/lib/fly-plans'
import type { Units } from '@/lib/types'
import { formatArea } from '@/lib/units'
import { UNSET_RATOON_COLOR } from '@/lib/ratoon-colors'
import type { StageColor } from '@/lib/resolve-colors'
import {
  type LayerFilter,
  EMPTY_LAYER_FILTER,
  isLayerFilterActive,
  fieldMatchesFilter,
} from './layer-filter'

// The Layers tab of the map sidebar — FarmWorks-style layer selection. Check
// stages / varieties / plantations to highlight only the matching blocks on the
// map (everything else goes white) and see their combined acreage.
export default function LayersPanel({
  fields,
  units,
  filter,
  onFilterChange,
  deselected,
  onSelectAll,
  onDeselectAll,
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
  colorBy,
  onColorByChange,
  stageColors,
  varietyColors,
  isSpray,
}: {
  fields: FieldRow[]
  units: Units
  filter: LayerFilter
  onFilterChange: (f: LayerFilter) => void
  deselected: boolean
  onSelectAll: () => void
  onDeselectAll: () => void
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
  colorBy: 'stage' | 'variety'
  onColorByChange: (c: 'stage' | 'variety') => void
  stageColors: StageColor[]
  varietyColors: Record<string, string>
  isSpray: boolean
}) {
  const active = isLayerFilterActive(filter)

  const matched = useMemo(
    () =>
      active
        ? fields.filter((f) => fieldMatchesFilter(f, filter))
        : deselected || activePlanId
          ? []
          : fields,
    [fields, filter, active, deselected, activePlanId],
  )
  const matchedAcres = matched.reduce((s, f) => s + Number(f.acreage_cached || 0), 0)
  const matchedArea = formatArea(matchedAcres, units)

  // Options present on this farm, with per-option block counts.
  const stageOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of fields) {
      const k = f.current_ratoon ?? 'unset'
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    const opts = stageColors.filter((r) => counts.has(r.key)).map((r) => ({
      key: r.key,
      label: r.label,
      color: r.color,
      count: counts.get(r.key)!,
    }))
    if (counts.has('unset')) {
      opts.push({ key: 'unset', label: 'No cut set', color: UNSET_RATOON_COLOR, count: counts.get('unset')! })
    }
    return opts
  }, [fields, stageColors])

  const varietyOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of fields) {
      const k = f.variety ?? ''
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0], undefined, { numeric: true })))
      .map(([key, count]) => ({ key, label: key === '' ? 'No variety' : key, count }))
  }, [fields])

  const plantationOptions = useMemo(() => {
    const seen = new Map<string | null, { label: string; count: number }>()
    for (const f of fields) {
      const id = f.plantation_id ?? null
      const cur = seen.get(id)
      if (cur) cur.count += 1
      else seen.set(id, { label: f.plantation_name ?? 'Unassigned', count: 1 })
    }
    return Array.from(seen.entries())
      .sort((a, b) => (a[0] === null ? 1 : b[0] === null ? -1 : a[1].label.localeCompare(b[1].label)))
      .map(([id, v]) => ({ key: id, label: v.label, count: v.count }))
  }, [fields])

  const toggle = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]

  const allOn = !active && !deselected && !activePlanId

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Select all (login default, full colors) vs deselect all (white pilot
          map, every label still on). */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          className={`flex-1 text-xs font-semibold rounded-md border-2 px-2 py-1.5 transition ${
            allOn
              ? 'bg-primary text-white border-primary'
              : 'bg-white text-primary border-primary hover:bg-primary/5'
          }`}
        >
          Select all
        </button>
        <button
          type="button"
          onClick={onDeselectAll}
          className={`flex-1 text-xs font-semibold rounded-md border-2 px-2 py-1.5 transition ${
            deselected && !active && !activePlanId
              ? 'bg-primary text-white border-primary'
              : 'bg-white text-primary border-primary hover:bg-primary/5'
          }`}
        >
          Deselect all
        </button>
      </div>

      {/* Live selection summary */}
      <div className={`px-4 py-3 border-b border-gray-100 ${active ? 'bg-accent/10' : 'bg-gray-50'}`}>
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
              {active ? 'Matching selection' : allOn ? 'All blocks' : 'White map'}
            </p>
            <p className="text-lg font-bold text-primary mt-0.5">
              {matched.length} block{matched.length === 1 ? '' : 's'} ·{' '}
              {matchedArea.primary}
            </p>
          </div>
          {active && (
            <button
              type="button"
              onClick={() => onFilterChange(EMPTY_LAYER_FILTER)}
              className="text-xs font-semibold text-primary hover:underline shrink-0"
            >
              Clear
            </button>
          )}
        </div>
        {active && matched.length > 0 && (
          <a
            // highlight=1: the sheet draws the whole CONTEXT — the matches
            // colored, the rest white with black outlines. When plantations
            // are part of the filter, context = those plantations only;
            // otherwise the whole operation.
            href={`/blocks/print?ids=${matched.map((f) => f.id).join(',')}&highlight=1${
              filter.plantations.length > 0
                ? `&scope=${filter.plantations.map((pid) => pid ?? '__none').join(',')}`
                : ''
            }${colorBy === 'variety' ? '&colorby=variety' : ''}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block text-center text-xs font-semibold rounded-md border-2 border-primary text-primary px-3 py-1.5 hover:bg-primary/5"
          >
            Print these {matched.length} highlighted →
          </a>
        )}
        {allOn && (
          <p className="text-[11px] text-gray-500 mt-1 leading-snug">
            Check layers below to highlight only those blocks — picks from
            different groups stack (plant cane + a variety + a plantation).
          </p>
        )}
        {!active && deselected && !activePlanId && (
          <p className="text-[11px] text-gray-500 mt-1 leading-snug">
            Plain white map — every block outlined with its id and acreage.
            Check a layer to light blocks up, or build a fly plan below.
          </p>
        )}
      </div>

      {/* Color by — which palette paints the highlighted blocks. Filters pick
          WHICH blocks; this picks the colors, so stage + variety picks never
          fight over the palette. Always visible: from the white map, checking
          a layer lights blocks up in this palette. */}
      {Object.keys(varietyColors).length > 0 && (
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider font-bold text-gray-600 shrink-0">
            Color by
          </span>
          <div className="flex-1 flex rounded-md border border-gray-200 overflow-hidden">
            {(
              [
                ['stage', 'Year cane'],
                ['variety', 'Variety'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onColorByChange(key)}
                className={`flex-1 text-xs font-semibold px-2 py-1.5 transition ${
                  colorBy === key
                    ? 'bg-primary text-white'
                    : 'bg-white text-gray-600 hover:text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Year cane */}
      <LayerGroup title="Year cane">
        {stageOptions.map((o) => (
          <LayerRow
            key={o.key}
            label={o.label}
            count={o.count}
            checked={filter.stages.includes(o.key)}
            onToggle={() => onFilterChange({ ...filter, stages: toggle(filter.stages, o.key) })}
            dot={o.color}
          />
        ))}
      </LayerGroup>

      {/* Variety */}
      {varietyOptions.length > 0 && (
        <LayerGroup title="Variety">
          {varietyOptions.map((o) => (
            <LayerRow
              key={o.key || '__none'}
              label={o.label}
              count={o.count}
              checked={filter.varieties.includes(o.key)}
              onToggle={() =>
                onFilterChange({ ...filter, varieties: toggle(filter.varieties, o.key) })
              }
              // Variety colors only apply when the variety palette is active —
              // showing them under year-cane coloring would lie about the map.
              dot={colorBy === 'variety' && o.key ? varietyColors[o.key] : undefined}
            />
          ))}
        </LayerGroup>
      )}

      {/* Plantation */}
      {plantationOptions.length > 1 && (
        <LayerGroup title="Plantation">
          {plantationOptions.map((o) => (
            <LayerRow
              key={o.key ?? '__unassigned'}
              label={o.label}
              count={o.count}
              checked={filter.plantations.includes(o.key)}
              onToggle={() =>
                onFilterChange({ ...filter, plantations: toggle(filter.plantations, o.key) })
              }
            />
          ))}
        </LayerGroup>
      )}

      {/* Fly plans — named, colored block selections for the sprayer pilot. */}
      <FlyPlansSection
        fields={fields}
        units={units}
        flyPlans={flyPlans}
        activePlanId={activePlanId}
        onViewPlan={onViewPlan}
        onClosePlan={onClosePlan}
        onDeletePlan={onDeletePlan}
        planDraft={planDraft}
        onStartPlanDraft={onStartPlanDraft}
        onCancelPlanDraft={onCancelPlanDraft}
        onSavePlanDraft={onSavePlanDraft}
        selectedIds={selectedIds}
      />
    </div>
  )
}

// ── Fly plans ──────────────────────────────────────────────────────────
// "1st spray" = red on these blocks, "2nd spray" = yellow on those. Viewing a
// plan paints only its blocks (in the plan color) on the white map; printing
// hands the pilot the same sheet in B&W with the plan blocks filled in.

const PLAN_COLORS = ['#DC2626', '#EAB308', '#2563EB', '#16A34A', '#EA580C', '#7C3AED']

function FlyPlansSection({
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
    <div>
      <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur px-4 py-1.5 border-y border-gray-100">
        <span className="text-[11px] uppercase tracking-wider font-bold text-gray-600">
          Fly plans
        </span>
      </div>

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
            Tap the blocks to spray on the map — tap again to remove one.
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
              {saving ? 'Saving…' : 'Save fly plan'}
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
          <ul className="divide-y divide-gray-50">
            {flyPlans.map((p) => {
              const stats = planStats(p)
              const viewing = activePlanId === p.id
              return (
                <li key={p.id} className={viewing ? 'bg-primary/5' : ''}>
                  <div className="px-4 py-2.5 flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="w-3.5 h-3.5 rounded-sm flex-shrink-0 border border-black/10"
                      style={{ background: p.color }}
                    />
                    <button
                      type="button"
                      onClick={() => (viewing ? onClosePlan() : onViewPlan(p.id))}
                      className="flex-1 min-w-0 text-left"
                    >
                      <span className="block text-sm font-semibold text-gray-800 truncate">
                        {p.name}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {stats.count} block{stats.count === 1 ? '' : 's'} · {stats.area.primary}
                      </span>
                    </button>
                    <span className="flex items-center gap-3 shrink-0 text-xs font-semibold">
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
                        onClick={() => setConfirmDelete(p.id)}
                        className="text-red-700 hover:underline"
                      >
                        Delete
                      </button>
                    </span>
                  </div>
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
            <div className="px-4 py-2.5">
              <button
                type="button"
                onClick={() => setNewOpen(true)}
                className="text-sm font-semibold text-primary hover:underline"
              >
                + New fly plan
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function LayerGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur px-4 py-1.5 border-y border-gray-100">
        <span className="text-[11px] uppercase tracking-wider font-bold text-gray-600">{title}</span>
      </div>
      <ul className="divide-y divide-gray-50">{children}</ul>
    </div>
  )
}

function LayerRow({
  label,
  count,
  checked,
  onToggle,
  dot,
}: {
  label: string
  count: number
  checked: boolean
  onToggle: () => void
  dot?: string
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 transition flex items-center gap-3 ${
          checked ? 'bg-primary/5' : ''
        }`}
      >
        <span
          aria-hidden="true"
          className={`w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center ${
            checked ? 'bg-primary border-primary text-white' : 'border-gray-300 bg-white'
          }`}
        >
          {checked && (
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 010 1.42l-8 8a1 1 0 01-1.42 0l-4-4a1 1 0 011.42-1.42L8 12.59l7.29-7.3a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </span>
        {dot && (
          <span
            aria-hidden="true"
            className="w-3.5 h-3.5 rounded-sm flex-shrink-0 border border-black/10"
            style={{ background: dot }}
          />
        )}
        <span className="flex-1 text-sm font-medium text-gray-800 truncate">{label}</span>
        <span className="text-xs text-gray-400 shrink-0">{count}</span>
      </button>
    </li>
  )
}
