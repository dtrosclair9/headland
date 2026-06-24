'use client'

import { useState } from 'react'
import { friendlyError } from '@/lib/errors'

type Interval = 'monthly' | 'annual'

// Map server error codes to plain-English messages.
const ERROR_MESSAGES: Record<string, string> = {
  no_acreage: 'Map your farm first — import or draw your blocks, then subscribe so we price it right.',
  price_not_configured: 'Pricing isn’t set up on this environment yet.',
  stripe_not_configured: 'Payments aren’t enabled on this environment yet.',
}

export default function UpgradeButtonClient({
  interval,
  label,
  variant = 'primary',
  disabled = false,
}: {
  interval: Interval
  label: string
  variant?: 'primary' | 'ghost'
  disabled?: boolean
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
        const code = data.error || 'Checkout failed'
        throw new Error(ERROR_MESSAGES[code] || code)
      }
      window.location.href = data.url
    } catch (e) {
      setError(friendlyError(e))
      setLoading(false)
    }
  }

  return (
    <div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <button
        type="button"
        onClick={go}
        disabled={loading || disabled}
        className={`w-full text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
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
