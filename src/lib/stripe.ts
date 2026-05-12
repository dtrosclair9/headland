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

import type { PlanTier } from '@/lib/types'

export function priceIdToPlanTier(
  priceId: string | null | undefined,
): PlanTier {
  if (!priceId) return 'free'
  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter'
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return 'business'
  return 'free'
}

export type CheckoutTier = 'starter' | 'pro' | 'business'

export function planTierToPriceId(tier: CheckoutTier): string | null {
  if (tier === 'starter') return process.env.STRIPE_PRICE_STARTER ?? null
  if (tier === 'pro') return process.env.STRIPE_PRICE_PRO ?? null
  if (tier === 'business') return process.env.STRIPE_PRICE_BUSINESS ?? null
  return null
}
