'use client'

import { useState } from 'react'
import { friendlyError } from '@/lib/errors'

export default function PortalForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Portal failed')
      }
      window.location.href = data.url
    } catch (e) {
      setError(friendlyError(e))
      setLoading(false)
    }
  }

  return (
    <div>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <button
        type="button"
        onClick={go}
        disabled={loading}
        className="btn-primary text-sm disabled:opacity-50"
      >
        {loading ? 'Opening portal…' : 'Open Stripe portal'}
      </button>
    </div>
  )
}
