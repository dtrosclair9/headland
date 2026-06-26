'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { friendlyError } from '@/lib/errors'

export default function SnapshotButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  async function go() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/snapshots/create', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Snapshot failed')
      router.refresh()
    } catch (e) { setError(friendlyError(e, 'Couldn’t create the snapshot. Please try again.')) }
    finally { setLoading(false) }
  }
  return (
    <div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <button type="button" onClick={go} disabled={loading} className="btn-primary text-sm disabled:opacity-50">
        {loading ? 'Creating…' : 'Create snapshot now'}
      </button>
    </div>
  )
}
