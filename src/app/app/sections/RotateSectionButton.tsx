'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Advances every block in a section to its next year cane, after a clear
// confirmation. Used on the Sections page so a grower can roll a whole farm
// forward at season's end instead of editing each block by hand.
export default function RotateSectionButton({
  sectionId,
  sectionName,
  fieldCount,
}: {
  sectionId: string
  sectionName: string
  fieldCount: number
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function rotate() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/fields/bulk-rotate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ section_id: sectionId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Rotation failed')
      }
      const { advanced, skipped } = await res.json()
      setResult(
        `Advanced ${advanced} block${advanced === 1 ? '' : 's'}` +
          (skipped > 0 ? ` · ${skipped} left as-is (fallow, 6th+, or no cut set)` : ''),
      )
      setConfirming(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (fieldCount === 0) return null

  return (
    <div className="text-right">
      {!confirming ? (
        <button
          type="button"
          onClick={() => {
            setConfirming(true)
            setResult(null)
          }}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Rotate to next cycle →
        </button>
      ) : (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-left">
          <p className="text-sm font-semibold text-amber-900">
            Roll <span className="underline">{sectionName}</span> forward one year cane?
          </p>
          <p className="mt-1 text-xs text-amber-800 leading-relaxed">
            Every block here moves to its next cut — plant cane → 1st stubble, 1st → 2nd, and so
            on through 6th. Blocks that are fallow, already 6th+, or have no cut set won&apos;t
            change. There&apos;s no bulk undo, so you&apos;d fix any one block by hand afterward.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={rotate}
              disabled={busy}
              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
            >
              {busy ? 'Rotating…' : 'Yes, rotate'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="text-xs text-gray-600 hover:text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {result && <p className="mt-2 text-xs text-green-700">{result}</p>}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  )
}
