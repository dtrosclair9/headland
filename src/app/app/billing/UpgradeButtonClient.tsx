'use client'

import { useState } from 'react'

type Interval = 'monthly' | 'annual'

export default function UpgradeButtonClient({
  interval,
  label,
  variant = 'primary',
}: {
  interval: Interval
  label: string
  variant?: 'primary' | 'ghost'
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ interval }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Checkout failed')
      }
      window.location.href = data.url
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setLoading(false)
    }
  }

  return (
    <div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <button
        type="button"
        onClick={go}
        disabled={loading}
        className={`w-full text-sm disabled:opacity-50 ${
          variant === 'primary'
            ? 'btn-primary'
            : 'rounded-md border-2 border-primary text-primary font-semibold px-4 py-2 hover:bg-primary/5'
        }`}
      >
        {loading ? 'Redirecting…' : label}
      </button>
    </div>
  )
}
