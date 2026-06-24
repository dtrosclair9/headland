'use client'

import { useState } from 'react'
import Link from 'next/link'
import { friendlyError } from '@/lib/errors'

interface ParseResult {
  count: number
  columns: string[]
  samples: Record<string, string>
  distinct: Record<string, string[]>
}

const RATOON_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— skip —' },
  { value: 'plant_cane', label: 'Plant cane' },
  { value: 'first_stubble', label: '1st stubble' },
  { value: 'second_stubble', label: '2nd stubble' },
  { value: 'third_stubble', label: '3rd stubble' },
  { value: 'fourth_stubble', label: '4th stubble' },
  { value: 'fifth_stubble_plus', label: '5th stubble' },
  { value: 'sixth_stubble_plus', label: '6th+ stubble' },
  { value: 'fallow', label: 'Fallow' },
]

export default function ImportWizard({ existingCount }: { existingCount: number }) {
  const [files, setFiles] = useState<File[]>([])
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [parse, setParse] = useState<ParseResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [nameCol, setNameCol] = useState('')
  const [varietyCol, setVarietyCol] = useState('')
  const [plantationCol, setPlantationCol] = useState('')
  const [acresCol, setAcresCol] = useState('')
  const [cutCol, setCutCol] = useState('')
  const [cutMap, setCutMap] = useState<Record<string, string>>({})
  const [imported, setImported] = useState<number | null>(null)

  async function doParse(e: React.FormEvent) {
    e.preventDefault()
    if (!files.length) {
      setError('Choose your shapefile first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      files.forEach((f) => fd.append('files', f))
      const res = await fetch('/api/import/parse', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not read that file.')
      setParse(data as ParseResult)
      // Auto-suggest the column mapping from common header names so the grower
      // mostly just confirms. They can override any of these.
      const cols: string[] = (data as ParseResult).columns || []
      const pick = (...res: RegExp[]) => {
        for (const re of res) {
          const c = cols.find((x) => re.test(x))
          if (c) return c
        }
        return ''
      }
      setNameCol(pick(/field\s*i\b/i, /field\s*name/i, /^name$/i, /\bblock\b/i, /label/i))
      setVarietyCol(pick(/variet/i))
      setAcresCol(pick(/fsa[\s_]*acre/i, /\bacre/i))
      setCutCol(pick(/year\s*cane/i, /ratoon/i, /stubble/i, /^cut$/i, /cycle/i))
      setStep(2)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  async function doImport() {
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      files.forEach((f) => fd.append('files', f))
      fd.append(
        'mapping',
        JSON.stringify({
          nameColumn: nameCol || null,
          varietyColumn: varietyCol || null,
          plantationColumn: plantationCol || null,
          acresColumn: acresCol || null,
          cutColumn: cutCol || null,
          cutValueMap: cutMap,
        }),
      )
      const res = await fetch('/api/import/commit', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed.')
      setImported(data.imported as number)
      setStep(3)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  // ── Step 3: done ──────────────────────────────────────────────────
  if (step === 3) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-6 text-center">
        <p className="text-3xl mb-2">🌱</p>
        <h2 className="text-xl font-bold text-primary">Imported {imported} fields</h2>
        <p className="text-sm text-gray-600 mt-2 mb-6">
          Your operation is on the map. Open any block to fine-tune its details.
        </p>
        <Link href="/app/map" className="btn-primary">View on the map</Link>
      </div>
    )
  }

  // ── Step 2: map columns ───────────────────────────────────────────
  if (step === 2 && parse) {
    const cols = parse.columns
    const cutValues = cutCol ? parse.distinct[cutCol] ?? [] : []
    return (
      <div className="space-y-5">
        <div className="rounded-md bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-800">
          Found <strong>{parse.count}</strong> field{parse.count === 1 ? '' : 's'} in your file. Now tell us which column is which.
        </div>
        {error && (
          <div className="rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-5">
          <ColumnSelect label="Field name" hint="What labels each block (optional)" cols={cols} samples={parse.samples} value={nameCol} onChange={setNameCol} />
          <ColumnSelect label="Variety" hint="Cane variety (optional)" cols={cols} samples={parse.samples} value={varietyCol} onChange={setVarietyCol} />
          <ColumnSelect label="Plantation" hint="Groups blocks — we'll create these plantations (optional)" cols={cols} samples={parse.samples} value={plantationCol} onChange={setPlantationCol} />
          <ColumnSelect label="Acreage" hint="Your stated acres (e.g. FSA acres). Recommended — we trust this over the polygon size." cols={cols} samples={parse.samples} value={acresCol} onChange={setAcresCol} />
          <ColumnSelect label="Cut / ratoon" hint="Which column holds the year-cane / stubble (optional)" cols={cols} samples={parse.samples} value={cutCol} onChange={(v) => { setCutCol(v); setCutMap({}) }} />

          {cutCol && cutValues.length > 0 && (
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
              <p className="text-sm font-semibold text-primary mb-1">Match your cut values to stages</p>
              <p className="text-xs text-gray-500 mb-3">
                Your file uses these codes in <strong>{cutCol}</strong>. Tell us what each one means so the crop map colors right.
              </p>
              <div className="space-y-2">
                {cutValues.map((v) => (
                  <div key={v} className="flex items-center gap-3">
                    <code className="text-xs bg-white border border-gray-200 rounded px-2 py-1 min-w-[3rem] text-center">{v}</code>
                    <span className="text-gray-400">→</span>
                    <select
                      className="input flex-1 text-sm py-1.5"
                      value={cutMap[v] ?? ''}
                      onChange={(e) => setCutMap((m) => ({ ...m, [v]: e.target.value }))}
                    >
                      {RATOON_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
          {cutCol && cutValues.length === 0 && (
            <p className="text-xs text-gray-500">That column has too many distinct values to map as a cut — pick a different one.</p>
          )}
        </div>

        <div className="rounded-md bg-amber-50 border border-amber-100 px-4 py-2.5 text-sm text-amber-900">
          {existingCount > 0
            ? <>This adds <strong>{parse.count}</strong> blocks to your existing <strong>{existingCount}</strong>.</>
            : <>This will create <strong>{parse.count}</strong> blocks.</>}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={doImport} disabled={busy} className="btn-primary disabled:opacity-50">
            {busy ? 'Importing…' : `Import ${parse.count} fields`}
          </button>
          <button onClick={() => { setStep(1); setParse(null); setError(null) }} disabled={busy} className="text-sm text-gray-500 hover:text-primary">
            Start over
          </button>
        </div>
      </div>
    )
  }

  // ── Step 1: upload ────────────────────────────────────────────────
  return (
    <form onSubmit={doParse} className="space-y-5">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      <div className="bg-white border border-gray-100 rounded-xl p-6">
        <label className="label" htmlFor="files">Your shapefile</label>
        <input
          id="files"
          type="file"
          multiple
          accept=".zip,.shp,.shx,.dbf,.prj,.cpg"
          onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
          className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:text-white file:px-4 file:py-2 file:text-sm file:font-semibold hover:file:bg-primary-light"
        />
        <p className="mt-2 text-xs text-gray-500">
          Select the <code>.shp</code>, <code>.dbf</code> (and <code>.shx</code>/<code>.prj</code>) together, or a single <code>.zip</code>. Coordinates must be latitude/longitude.
        </p>
        {files.length > 0 && (
          <p className="mt-2 text-xs text-gray-600">{files.length} file{files.length === 1 ? '' : 's'} selected.</p>
        )}
      </div>
      <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
        {busy ? 'Reading…' : 'Read file'}
      </button>
    </form>
  )
}

function ColumnSelect({
  label,
  hint,
  cols,
  samples,
  value,
  onChange,
}: {
  label: string
  hint: string
  cols: string[]
  samples: Record<string, string>
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— none —</option>
        {cols.map((c) => (
          <option key={c} value={c}>
            {c}{samples[c] ? ` (e.g. ${samples[c]})` : ''}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  )
}
