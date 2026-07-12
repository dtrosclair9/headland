'use client'

import { useEffect, useState } from 'react'
import { APPLICATION_LABELS } from '@/lib/application-types'
import { friendlyError } from '@/lib/errors'

// Log one operation onto many blocks at once — a to-do or a field-work
// application. Used from the bulk-select footer (any selection) and from a
// fly plan's "Log spray" (kind locked to application, herbicide default).
// Product names autocomplete from the farm's own history so nobody types
// "Atrazine 4L" twice.
export default function BulkLogPanel({
  blockIds,
  title,
  lockKind,
  eventColor,
  eventContext,
  onDone,
  onCancel,
}: {
  blockIds: string[]
  title: string
  /** lock the panel to one kind (plan work logging) */
  lockKind?: 'application'
  /** highlight color for the event's map snapshot (a plan's color) */
  eventColor?: string
  /** event title prefix (the plan name) */
  eventContext?: string
  onDone: (summary: string) => void
  onCancel: () => void
}) {
  const [kind, setKind] = useState<'todo' | 'application'>(lockKind ?? 'todo')
  const [text, setText] = useState('')
  const [type, setType] = useState('herbicide')
  const [product, setProduct] = useState('')
  const [rate, setRate] = useState('')
  const [unit, setUnit] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [time, setTime] = useState('')
  const [burnCat, setBurnCat] = useState('')
  const [notes, setNotes] = useState('')
  const [products, setProducts] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/operations/products')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setProducts(d.products ?? [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const op =
        kind === 'todo'
          ? { kind: 'todo' as const, text: text.trim() }
          : {
              kind: 'application' as const,
              type,
              applied_at: date,
              ...(product.trim() ? { product: product.trim() } : {}),
              ...(rate && !isNaN(Number(rate)) ? { rate: Number(rate) } : {}),
              ...(unit.trim() ? { unit: unit.trim() } : {}),
              ...(time ? { applied_time: time } : {}),
              ...(isBurn && burnCat ? { burn_category: burnCat } : {}),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            }
      const res = await fetch('/api/operations/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          block_ids: blockIds,
          op,
          ...(eventColor ? { color: eventColor } : {}),
          ...(eventContext ? { context: eventContext } : {}),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to log')
      }
      onDone(
        kind === 'todo'
          ? `To-do added to ${blockIds.length} block${blockIds.length === 1 ? '' : 's'}`
          : `${APPLICATION_LABELS[type]} logged on ${blockIds.length} block${blockIds.length === 1 ? '' : 's'}`,
      )
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  const canSave = kind === 'todo' ? text.trim().length > 0 : !!date
  const isBurn = type === 'pre_harvest_burn' || type === 'post_harvest_burn'

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 space-y-2">
      <p className="text-xs font-semibold text-primary">{title}</p>
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
          {error}
        </p>
      )}
      {!lockKind && (
        <div className="flex rounded-md border border-gray-200 overflow-hidden">
          {(
            [
              ['todo', 'To-do'],
              ['application', 'Field work'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex-1 text-xs font-semibold px-2 py-1.5 transition ${
                kind === k ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {kind === 'todo' ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Spray johnson grass"
          className="input text-sm w-full"
          autoFocus
        />
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="input text-xs py-1.5 flex-1"
              aria-label="Work type"
            >
              {Object.entries(APPLICATION_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input text-xs py-1.5 w-36"
              aria-label="Date"
            />
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="input text-xs py-1.5 w-28"
              aria-label="Time of operation (optional)"
            />
            <span className="text-[11px] text-gray-500 flex-1">
              Time (optional) — records that hour&apos;s weather
            </span>
          </div>
          {isBurn && (
            <select
              value={burnCat}
              onChange={(e) => setBurnCat(e.target.value)}
              className="input text-xs py-1.5 w-full"
              aria-label="LDAF burn category day"
            >
              <option value="">Burn category (LDAF category day)…</option>
              <option value="1">1 — No burning</option>
              <option value="2">2 — After 11 a.m., out by 4 p.m.</option>
              <option value="3">3 — Daytime, after inversion lifts</option>
              <option value="4">4 — Burning anytime</option>
              <option value="5">5 — Unstable &amp; windy, burn with caution</option>
            </select>
          )}
          <input
            type="text"
            list="product-history"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            maxLength={200}
            placeholder="Product (optional)"
            className="input text-sm w-full"
          />
          <datalist id="product-history">
            {products.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {products.length > 0 && !product && (
            <div className="flex flex-wrap gap-1">
              {products.slice(0, 5).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProduct(p)}
                  className="text-[11px] font-semibold rounded-full border border-gray-200 px-2 py-0.5 text-gray-600 hover:border-primary hover:text-primary"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="Rate"
              className="input text-sm flex-1"
              min="0"
              step="any"
            />
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              maxLength={20}
              placeholder="qt/ac"
              className="input text-sm w-24"
            />
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            placeholder="Notes (optional)"
            className="input text-sm w-full"
          />
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={save}
          className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
        >
          {saving ? 'Logging…' : `Log for ${blockIds.length} block${blockIds.length === 1 ? '' : 's'}`}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="text-xs text-gray-600 hover:text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
