// Per-plan feature limits. Used for both UI display and server-side enforcement.
// Tier brackets matched to the LA cane farm-size distribution research in
// docs/farm-size-distribution.md (40% of farms exited 2017-2022; bimodal
// distribution with fat middle at 1,000-5,000 ac, heavy tail of <500 ac).

import type { PlanTier } from '@/lib/types'

export interface PlanLimits {
  name: string
  /** Acreage cap. Number.POSITIVE_INFINITY = unlimited. */
  acres: number
  /** Field count cap. */
  fields: number
  /** Team member cap. */
  users: number
  /** NDVI / Sentinel-2 latest view enabled. */
  ndvi: boolean
  /** Per-acre rate quoted on /pricing (informational, not enforced here). */
  perAcre: number | null
  /** Annual minimum (USD), informational. */
  annualMin: number | null
  /** Recurring price displayed on /pricing. */
  priceDisplay: string
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    name: 'Free',
    acres: 100,
    fields: 5,
    users: 1,
    ndvi: false,
    perAcre: null,
    annualMin: null,
    priceDisplay: '$0',
  },
  starter: {
    name: 'Starter',
    acres: 500,
    fields: 25,
    users: 2,
    ndvi: true,
    perAcre: null,
    annualMin: 1188,
    priceDisplay: '$99 / mo',
  },
  pro: {
    name: 'Pro',
    acres: 1_500,
    fields: 100,
    users: 5,
    ndvi: true,
    perAcre: 3.0,
    annualMin: 1500,
    priceDisplay: '$3 / ac / yr',
  },
  business: {
    name: 'Business',
    acres: 4_000,
    fields: Number.POSITIVE_INFINITY,
    users: 10,
    ndvi: true,
    perAcre: 2.5,
    annualMin: 3750,
    priceDisplay: '$2.50 / ac / yr',
  },
  enterprise: {
    name: 'Enterprise',
    acres: Number.POSITIVE_INFINITY,
    fields: Number.POSITIVE_INFINITY,
    users: Number.POSITIVE_INFINITY,
    ndvi: true,
    perAcre: 1.75,
    annualMin: 7000,
    priceDisplay: '$1.75 / ac / yr · custom',
  },
}

export function fieldLimitFor(tier: PlanTier): number {
  return PLAN_LIMITS[tier].fields
}

export function acreLimitFor(tier: PlanTier): number {
  return PLAN_LIMITS[tier].acres
}

export function isAtFieldLimit(tier: PlanTier, currentCount: number): boolean {
  return currentCount >= fieldLimitFor(tier)
}

export function isOverAcreLimit(tier: PlanTier, currentAcres: number): boolean {
  return currentAcres > acreLimitFor(tier)
}
