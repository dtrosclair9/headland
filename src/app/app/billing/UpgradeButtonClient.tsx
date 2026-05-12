'use client'

import { useState } from 'react'

type Tier = 'starter' | 'pro' | 'business'

const LABELS: Record<Tier, string> = {
  starter: 'Upgrade to Starter',
  pro: 'Upgrade to Pro',
  business: 'Upgrade to Business',
}

export default function UpgradeButtonClient({ tier }: { tier: Tier }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tier }),
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
    <div className="mt-auto">
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <button
        type="button"
        onClick={go}
        disabled={loading}
        className="btn-primary w-full text-sm disabled:opacity-50"
      >
        {loading ? 'Redirecting…' : LABELS[tier]}
      </button>
    </div>
  )
}
