import Stripe from 'stripe'

let cachedClient: Stripe | null = null

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY not configured.')
  }
  if (cachedClient) return cachedClient
  // Use the SDK's default API version (Stripe SDK pins compatible version
  // per release). Passing an outdated apiVersion string trips strict types
  // in SDK 22.x and shouldn't be necessary.
  cachedClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
    appInfo: { name: 'Headland', version: '0.1.0' },
  })
  return cachedClient
}

import type { BillingInterval } from '@/lib/billing'

// One graduated per-acre Stripe Price per billing interval (annual = monthly ×
// 10). Created by scripts/create-stripe-prices.cjs; quantity = mapped acres.
export function priceIdForInterval(interval: BillingInterval): string | null {
  if (interval === 'monthly') return process.env.STRIPE_PRICE_MONTHLY ?? null
  if (interval === 'annual') return process.env.STRIPE_PRICE_ANNUAL ?? null
  return null
}
