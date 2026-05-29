import type { Organization } from '@/lib/types'

// Single flat plan. Monthly, or annual at ~2 months free.
export const PRICING = {
  monthly: 297,
  annual: 2970,
  trialDays: 14,
} as const

export type BillingInterval = 'monthly' | 'annual'

const DAY_MS = 24 * 60 * 60 * 1000

type OrgAccessFields = Pick<Organization, 'subscription_status' | 'created_at'>

export function trialEndsAt(org: Pick<Organization, 'created_at'>): Date {
  return new Date(new Date(org.created_at).getTime() + PRICING.trialDays * DAY_MS)
}

export function trialDaysLeft(org: Pick<Organization, 'created_at'>): number {
  const ms = trialEndsAt(org).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / DAY_MS))
}

// A paid (or Stripe-trialing) subscription is live.
export function hasActiveSubscription(
  org: Pick<Organization, 'subscription_status'>,
): boolean {
  return org.subscription_status === 'active' || org.subscription_status === 'trialing'
}

// Still inside the free app-side trial window (no card required to start).
export function isInTrial(org: OrgAccessFields): boolean {
  return !hasActiveSubscription(org) && trialDaysLeft(org) > 0
}

// Full access = paying subscriber OR within the 14-day free trial.
export function orgHasAccess(org: OrgAccessFields): boolean {
  return hasActiveSubscription(org) || trialDaysLeft(org) > 0
}
