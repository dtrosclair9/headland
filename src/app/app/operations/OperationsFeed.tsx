'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { OperationEntry, OperationKind } from '@/lib/operations'
import { friendlyError } from '@/lib/errors'

// Type chips: label + badge color per record kind.
const KINDS: { key: OperationKind; label: string; badge: string }[] = [
  { key: 'todo', label: 'To-dos', badge: 'bg-amber-100 text-amber-900' },
  { key: 'application', label: 'Sprays & field work', badge: 'bg-blue-100 text-blue-900' },
  { key: 'harvest', label: 'Harvests', badge: 'bg-green-100 text-green-900' },
  { key: 'scouting', label: 'Scouting', badge: 'bg-red-100 text-red-900' },
  { key: 'rotation', label: 'Rotations', badge: 'bg-purple-100 text-purple-900' },
]
const BADGE: Record<OperationKind, string> = Object.fromEntries(
  KINDS.map((k) => [k.key, k.badge]),
) as Record<OperationKind, string>
const KIND_LABEL: Record<OperationKind, string> = {
  todo: 'To-do',
  application: 'Field work',
  harvest: 'Harvest',
  scouting: 'Scouting',
  rotation: 'Rotation',
}

function monthKey(iso: string) {
  return iso.slice(0, 7)
}
function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function dayLabel(iso: string) {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function OperationsFeed({
  openTodos,
  history,
  hasOlder,
  months,
}: {
  openTodos: OperationEntry[]
  history: OperationEntry[]
  hasOlder: boolean
  months: number
}) {
  const [kinds, setKinds] = useState<OperationKind[]>([])
  const [plantation, setPlantation] = useState<string>('')
  const [query, setQuery] = useState('')
  // Local copy so checking a to-do off removes it without a full reload.
  const [todos, setTodos] = useState<OperationEntry[]>(openTodos)
  const [completeError, setCompleteError] = useState<string | null>(null)

  async function completeTodo(id: string) {
    setCompleteError(null)
    const prev = todos
    const entry = todos.find((e) => e.id === id)
    setTodos((t) => t.filter((e) => e.id !== id))
    // Completed to-dos are kept as history — surface it there right away.
    if (entry) {
      setHistoryLocal((h) => [
        {
          ...entry,
          done: true,
          date: new Date().toISOString(),
          title: 'To-do completed',
        },
        ...h,
      ])
    }
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ done: true }),
      })
      if (!res.ok) throw new Error('Failed to complete to-do')
    } catch (e) {
      setTodos(prev)
      setHistoryLocal(history)
      setCompleteError(friendlyError(e))
    }
  }

  // History is also local so a checked-off to-do appears in it immediately.
  const [historyLocal, setHistoryLocal] = useState<OperationEntry[]>(history)

  const plantations = useMemo(() => {
    const set = new Set<string>()
    for (const e of [...todos, ...historyLocal]) set.add(e.plantation ?? 'Unassigned')
    return Array.from(set).sort((a, b) =>
      a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b),
    )
  }, [todos, historyLocal])

  const q = query.trim().toLowerCase()
  const matches = (e: OperationEntry) => {
    if (kinds.length > 0 && !kinds.includes(e.kind)) return false
    if (plantation && (e.plantation ?? 'Unassigned') !== plantation) return false
    if (
      q &&
      !`${e.blockName} ${e.plantation ?? ''} ${e.title} ${e.detail ?? ''}`.toLowerCase().includes(q)
    )
      return false
    return true
  }

  const todosShown = todos.filter(matches)
  const historyShown = historyLocal.filter(matches)

  const monthGroups = useMemo(() => {
    const map = new Map<string, OperationEntry[]>()
    for (const e of historyShown) {
      const k = monthKey(e.date)
      const arr = map.get(k) ?? []
      arr.push(e)
      map.set(k, arr)
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [historyShown])

  const toggleKind = (k: OperationKind) =>
    setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))

  return (
    <div className="max-w-3xl">
      {/* Print styles: the browser print of this page is the farmer's
          look-back over months/years — hide the app chrome + controls and
          keep month sections together where possible. */}
      <style>{`
        @media print {
          header, nav { display: none !important; }
          .print-hide { display: none !important; }
          .print-month { break-inside: avoid; }
          .print-month h3 { position: static !important; }
          body { background: white !important; }
          /* The app shell locks the viewport height so the map can fill it
             (h-[100dvh] overflow-hidden + scrolling main) — in print that
             clips everything below the first screenful. Unlock it. */
          html, body { height: auto !important; overflow: visible !important; }
          body > div { height: auto !important; overflow: visible !important; }
          main { height: auto !important; overflow: visible !important; }
        }
      `}</style>

      {/* Filters */}
      <div className="print-hide flex flex-wrap items-center gap-2 mb-6">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => toggleKind(k.key)}
            className={`text-xs font-semibold rounded-full px-3 py-1.5 border-2 transition ${
              kinds.includes(k.key)
                ? 'border-primary bg-primary text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-primary'
            }`}
          >
            {k.label}
          </button>
        ))}
        <select
          value={plantation}
          onChange={(e) => setPlantation(e.target.value)}
          className="input text-xs py-1.5 w-40"
          aria-label="Filter by plantation"
        >
          <option value="">All plantations</option>
          {plantations.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search block, product, notes…"
          className="input text-xs py-1.5 flex-1 min-w-40"
          aria-label="Search operations"
        />
        <button
          type="button"
          onClick={() => window.print()}
          className="text-xs font-semibold rounded-md border-2 border-primary text-primary px-3 py-1.5 hover:bg-primary/5"
          title="Print this view — current filters and time window apply"
        >
          Print
        </button>
      </div>

      {/* Open to-dos — pinned, always fully loaded */}
      <section className="mb-8">
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-600">Open to-dos</h2>
          <span className="text-xs font-bold text-white bg-accent rounded-full px-2 py-0.5">
            {todosShown.length}
          </span>
        </div>
        {completeError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1 mb-2">
            {completeError}
          </p>
        )}
        {todosShown.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white border border-gray-100 rounded-xl px-4 py-3">
            Nothing open. Add to-dos from any block&apos;s page or the map&apos;s bulk select.
          </p>
        ) : (
          <ul className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
            {todosShown.map((e) => (
              <Entry key={`${e.kind}-${e.id}`} e={e} onComplete={completeTodo} />
            ))}
          </ul>
        )}
      </section>

      {/* History, month by month */}
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-600 mb-2">History</h2>
      {monthGroups.length === 0 ? (
        <p className="text-sm text-gray-500 bg-white border border-gray-100 rounded-xl px-4 py-3">
          No records in the last {months} months
          {kinds.length > 0 || plantation || q ? ' matching these filters' : ''}. Sprays, harvests,
          scouting, and rotations logged on blocks will show up here.
        </p>
      ) : (
        monthGroups.map(([key, entries]) => (
          <section key={key} className="mb-6 print-month">
            <h3 className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur text-sm font-bold text-primary px-1 py-1.5">
              {monthLabel(key)}
              <span className="text-xs font-normal text-gray-400 ml-2">
                {entries.length} record{entries.length === 1 ? '' : 's'}
              </span>
            </h3>
            <ul className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
              {entries.map((e) => (
                <Entry key={`${e.kind}-${e.id}`} e={e} />
              ))}
            </ul>
          </section>
        ))
      )}

      {hasOlder && (
        <a
          href={`/app/operations?months=${months + 12}`}
          className="print-hide block text-center text-sm font-semibold rounded-md border-2 border-primary text-primary px-3 py-2 hover:bg-primary/5 mb-8"
        >
          Show older history →
        </a>
      )}
    </div>
  )
}

function Entry({ e, onComplete }: { e: OperationEntry; onComplete?: (id: string) => void }) {
  const openTodo = e.kind === 'todo' && !e.done
  return (
    <li className="flex items-stretch">
      <Link
        // Open to-dos jump to the block ON THE MAP, zoomed to it; history
        // entries open the block's page.
        href={openTodo ? `/app/map?focus=${e.blockId}` : `/app/fields/${e.blockId}`}
        className="flex-1 min-w-0 flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 transition"
      >
        <span className="text-xs text-gray-400 w-12 shrink-0 pt-0.5">{dayLabel(e.date)}</span>
        <span
          className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0 mt-0.5 ${BADGE[e.kind]}`}
        >
          {KIND_LABEL[e.kind]}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-gray-800">
            <span className="font-semibold text-primary">{e.blockName}</span>
            {e.plantation && <span className="text-gray-400"> · {e.plantation}</span>}
            <span className="text-gray-700"> — {e.title}</span>
          </span>
          {e.detail && <span className="block text-xs text-gray-500 truncate">{e.detail}</span>}
        </span>
      </Link>
      {openTodo && onComplete && (
        <button
          type="button"
          onClick={() => onComplete(e.id)}
          title="Mark complete"
          aria-label={`Mark to-do on ${e.blockName} complete`}
          className="print-hide shrink-0 px-4 flex items-center text-gray-300 hover:text-green-700 transition"
        >
          <svg
            className="w-6 h-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M8.5 12.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </li>
  )
}
