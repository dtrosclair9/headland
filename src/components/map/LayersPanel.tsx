'use client'

import { useMemo } from 'react'
import type { FieldRow } from '@/lib/fields'
import type { PlanGroupRow } from '@/lib/fly-plans'
import type { Units } from '@/lib/types'
import { formatArea } from '@/lib/units'
import { UNSET_RATOON_COLOR } from '@/lib/ratoon-colors'
import type { StageColor } from '@/lib/resolve-colors'
import { ALL_LABEL_FIELDS, LABEL_FIELD_NAMES, type LabelField } from '@/lib/label-fields'
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
  activeGroupId,
  planGroups,
  onToggleGroup,
  colorBy,
  onColorByChange,
  stageColors,
  varietyColors,
  isSpray,
  snapshotId = null,
  labelFields,
  onLabelFieldsChange,
  onSaveViewDefault,
  onResetViewDefault,
  savingViewDefault = false,
}: {
  fields: FieldRow[]
  units: Units
  filter: LayerFilter
  onFilterChange: (f: LayerFilter) => void
  deselected: boolean
  onSelectAll: () => void
  onDeselectAll: () => void
  activeGroupId: string | null
  // Plans as layers: pick one and the map goes white except that plan's
  // blocks in their step colors.
  planGroups: PlanGroupRow[]
  onToggleGroup: (id: string) => void
  colorBy: 'stage' | 'variety'
  onColorByChange: (c: 'stage' | 'variety') => void
  stageColors: StageColor[]
  varietyColors: Record<string, string>
  isSpray: boolean
  // Archived-snapshot view: print links pull blocks from the snapshot, not the live farm.
  snapshotId?: string | null
  labelFields?: ReadonlySet<LabelField>
  onLabelFieldsChange?: (next: Set<LabelField>) => void
  onSaveViewDefault?: () => void
  onResetViewDefault?: () => void
  savingViewDefault?: boolean
}) {
  const active = isLayerFilterActive(filter)

  const activeGroup = activeGroupId
    ? (planGroups.find((g) => g.id === activeGroupId) ?? null)
    : null
  const matched = useMemo(() => {
    if (active) return fields.filter((f) => fieldMatchesFilter(f, filter))
    if (activeGroup) {
      const ids = new Set(activeGroup.steps.flatMap((st) => st.block_ids))
      return fields.filter((f) => ids.has(f.id))
    }
    return deselected ? [] : fields
  }, [fields, filter, active, deselected, activeGroup])
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

  const allOn = !active && !deselected && !activeGroupId

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
            deselected && !active && !activeGroupId
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
              {active ? 'Matching selection' : activeGroup ? activeGroup.name : allOn ? 'All blocks' : 'White map'}
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
            // The FILTER travels in the URL (a few stage/variety/plantation
            // tokens), never the expanded id list — 400+ ids overflowed the
            // request-URL ceiling and 414'd the print page on big layers.
            href={`/blocks/print?highlight=1${filter.stages
              .map((st) => `&stages=${encodeURIComponent(st)}`)
              .join('')}${filter.varieties
              .map((v) => `&varieties=${encodeURIComponent(v)}`)
              .join('')}${filter.plantations
              .map((pid) => `&plantations=${encodeURIComponent(pid ?? '__none')}`)
              .join('')}${colorBy === 'variety' ? '&colorby=variety' : ''}${snapshotId ? `&snapshot=${snapshotId}` : ''}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block text-center text-xs font-semibold rounded-md border-2 border-primary text-primary px-3 py-1.5 hover:bg-primary/5"
          >
            Print selected →
          </a>
        )}
        {allOn && (
          <p className="text-[11px] text-gray-500 mt-1 leading-snug">
            Check layers below to highlight only those blocks — picks from
            different groups stack (plant cane + a variety + a plantation).
          </p>
        )}
        {!active && deselected && !activeGroupId && (
          <p className="text-[11px] text-gray-500 mt-1 leading-snug">
            Plain white map — every block outlined with its id and acreage.
            Check a layer to light blocks up, or build one in the Plans tab.
          </p>
        )}
      </div>

      {/* Labels — which of the 4 block facts render on the map. Sits directly
          above Color by so the Save pill below the divider clearly caps both. */}
      <div className="px-4 py-2.5 border-b border-gray-100">
        <span className="text-[11px] uppercase tracking-wider font-bold text-gray-600">
          Labels
        </span>
        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5">
          {ALL_LABEL_FIELDS.map((f) => {
            const on = (labelFields ?? new Set<LabelField>(ALL_LABEL_FIELDS)).has(f)
            return (
              <label
                key={f}
                className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => {
                    const next = new Set<LabelField>(labelFields ?? new Set(ALL_LABEL_FIELDS))
                    if (next.has(f)) next.delete(f)
                    else next.add(f)
                    onLabelFieldsChange?.(next)
                  }}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                />
                {LABEL_FIELD_NAMES[f]}
              </label>
            )
          })}
        </div>
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

      {/* Save-as-default: caps the Labels + Color-by group so its scope is
          obvious. Always rendered (Color by hides when an org has no varieties). */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-3">
        <button
          type="button"
          onClick={onSaveViewDefault}
          disabled={savingViewDefault || (labelFields?.size ?? ALL_LABEL_FIELDS.length) === 0}
          title={
            (labelFields?.size ?? 1) === 0
              ? 'Pick at least one label to save as default'
              : undefined
          }
          className="flex-1 text-xs font-semibold rounded-md border-2 border-primary text-primary px-3 py-1.5 hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {savingViewDefault ? 'Saving…' : 'Save current view as default'}
        </button>
        <button
          type="button"
          onClick={onResetViewDefault}
          className="text-xs font-semibold text-gray-500 hover:text-primary shrink-0"
        >
          Reset
        </button>
      </div>

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
              dot={o.key ? varietyColors[o.key] : undefined}
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

      {/* Plans — each saved plan (set of colored steps) is a layer: pick one
          and the map goes white except its blocks in their step colors. */}
      {planGroups.length > 0 && (
        <LayerGroup title="Plans">
          {planGroups.map((g) => {
            const blockCount = g.steps.reduce((s2, st) => s2 + st.block_ids.length, 0)
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => onToggleGroup(g.id)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 transition flex items-center gap-3 ${
                    activeGroupId === g.id ? 'bg-primary/5' : ''
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center ${
                      activeGroupId === g.id
                        ? 'bg-primary border-primary text-white'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {activeGroupId === g.id && (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.704 5.29a1 1 0 010 1.42l-8 8a1 1 0 01-1.42 0l-4-4a1 1 0 011.42-1.42L8 12.59l7.29-7.3a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </span>
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
                  <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">
                    {g.name}
                    {g.completed_at && (
                      <span className="ml-1.5 text-[10px] font-bold text-green-700">✓ done</span>
                    )}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">{blockCount}</span>
                </button>
              </li>
            )
          })}
        </LayerGroup>
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
