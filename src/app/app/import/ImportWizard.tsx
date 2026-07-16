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

// Guess the ratoon stage from a raw cut value. Real files spell it every
// way — FarmWorks "P"/"1"/"4", FarmMind "Plant cane"/"1st year stubble"/
// "Fallow" — but the vocabulary is tiny: P/plant→plant cane, F/fallow→fallow,
// first digit 1–5 → that stubble, 6+ → 6th+. Unknown values stay unmapped
// for the grower to pick.
function suggestStage(raw: string): string {
  const v = raw.trim().toLowerCase()
  if (!v) return ''
  if (v.includes('fallow') || v === 'f') return 'fallow'
  if (v.includes('plant') || v === 'p' || v === 'pc' || v === '0') return 'plant_cane'
  const word = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'].findIndex((w) => v.includes(w))
  const digit = word >= 0 ? word + 1 : parseInt(v.match(/\d+/)?.[0] ?? '', 10)
  if (Number.isFinite(digit) && digit >= 1) {
    if (digit >= 6) return 'sixth_stubble_plus'
    return ['first_stubble', 'second_stubble', 'third_stubble', 'fourth_stubble', 'fifth_stubble_plus'][digit - 1]
  }
  return ''
}

// Pre-fill the cut value-map with suggestions for a column's distinct values.
function suggestCutMap(values: string[] | undefined): Record<string, string> {
  const map: Record<string, string> = {}
  for (const v of values ?? []) {
    const stage = suggestStage(v)
    if (stage) map[v] = stage
  }
  return map
}

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
  const [autoFilled, setAutoFilled] = useState<string[]>([])
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
      // Auto-suggest the column mapping. Covers the two real-world sources:
      // FarmWorks exports ("My Field ID", "tract_numb", "farm_numbe",
      // "FSA acres", "Year Cane", "Variety") and FSA CLU shapefiles ("CLUNBR",
      // "TRACTNBR", "FARMNBR", "CALCACRES"). The grower just confirms; every
      // pick is overridable below.
      const cols: string[] = (data as ParseResult).columns || []
      const pick = (...res: RegExp[]) => {
        for (const re of res) {
          const c = cols.find((x) => re.test(x))
          if (c) return c
        }
        return ''
      }
      const picks = {
        // grower's own block id first (FarmWorks "My Field ID"), else the FSA CLU number
        name: pick(/field\s*name/i, /\bmy\s*field/i, /field\s*id/i, /field\s*i\b/i, /^name$/i, /\blabel\b/i, /clu\s*n?br/i, /clu[\s_]*num/i),
        // Farm > Tract > Field: the FSA farm number is the bigger grouping,
        // closest to a grower's "plantation" — tracts are subsets within it.
        // Tract/farm/CLU numbers are captured per-block automatically either way.
        plantation: pick(/plantation/i, /\bsection\b/i, /farm\s*name/i, /farm[\s_]*n(um|br)/i, /^farm$/i, /tract/i),
        // prefer the FSA/official acreage over "My Acres" when both exist
        acres: pick(/fsa[\s_]*acre/i, /calc[\s_]*acre/i, /gis[\s_]*acre/i, /\bacres?\b/i, /acre/i),
        variety: pick(/variet/i, /\bcrop\b/i),
        cut: pick(/year\s*cane/i, /ratoon/i, /stubble/i, /^cut$/i, /\bcycle\b/i),
      }
      setNameCol(picks.name)
      setPlantationCol(picks.plantation)
      setAcresCol(picks.acres)
      setVarietyCol(picks.variety)
      setCutCol(picks.cut)
      setCutMap(picks.cut ? suggestCutMap((data as ParseResult).distinct[picks.cut]) : {})
      setAutoFilled(Object.entries(picks).filter(([, v]) => v).map(([k]) => k))
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
          Found <strong>{parse.count}</strong> field{parse.count === 1 ? '' : 's'} in your file.{' '}
          {autoFilled.length > 0
            ? <>We auto-matched <strong>{autoFilled.length}</strong> column{autoFilled.length === 1 ? '' : 's'} below — just confirm they look right (or adjust any).</>
            : <>Tell us which column is which below.</>}
        </div>
        {error && (
          <div className="rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-5">
          <ColumnSelect label="Field name" hint="What labels each block (optional)" cols={cols} samples={parse.samples} value={nameCol} onChange={setNameCol} />
          <ColumnSelect label="Variety" hint="Cane variety (optional)" cols={cols} samples={parse.samples} value={varietyCol} onChange={setVarietyCol} />
          <ColumnSelect label="Plantation" hint="Groups blocks into named areas — we'll create these plantations. FSA farm number is usually the closest grouping. (optional)" cols={cols} samples={parse.samples} value={plantationCol} onChange={setPlantationCol} />
          <ColumnSelect label="Acreage" hint="Your stated acres (e.g. FSA acres). Recommended — we trust this over the polygon size." cols={cols} samples={parse.samples} value={acresCol} onChange={setAcresCol} />
          <ColumnSelect label="Cut / ratoon" hint="Which column holds the year-cane / stubble (optional)" cols={cols} samples={parse.samples} value={cutCol} onChange={(v) => { setCutCol(v); setCutMap(suggestCutMap(parse.distinct[v])) }} />

          <p className="text-xs text-gray-500 border-t border-gray-100 pt-4">
            FSA <strong>farm</strong>, <strong>tract</strong>, and <strong>CLU</strong> numbers are detected and saved on each block automatically — no mapping needed.
          </p>

          {cutCol && cutValues.length > 0 && (
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
              <p className="text-sm font-semibold text-primary mb-1">Match your cut values to stages</p>
              <p className="text-xs text-gray-500 mb-3">
                Your file uses these codes in <strong>{cutCol}</strong>. We&apos;ve pre-matched the obvious ones — check them and fill any left on &ldquo;skip&rdquo;.
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
          accept=".zip,.shp,.shx,.dbf,.prj,.cpg,.geojson,.json"
          onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
          className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:text-white file:px-4 file:py-2 file:text-sm file:font-semibold hover:file:bg-primary-light"
        />
        <p className="mt-2 text-xs text-gray-500">
          Select the <code>.shp</code>, <code>.dbf</code> (and <code>.shx</code>/<code>.prj</code>) together, a single <code>.zip</code>, or a <code>.geojson</code>. Include the <code>.prj</code> and we&apos;ll auto-convert projected files (UTM, State Plane) from your FSA CLU export.
        </p>
        {files.length > 0 && (
          <p className="mt-2 text-xs text-gray-600">{files.length} file{files.length === 1 ? '' : 's'} selected.</p>
        )}
      </div>
      <button type="submit" disabled={busy || files.length === 0} className="btn-primary disabled:opacity-50">
        {busy ? 'Reading…' : files.length > 0 ? 'Import farm' : 'Read file'}
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
