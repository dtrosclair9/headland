import type { Organization } from '@/lib/types'

// Single flat plan. Monthly, or annual at ~2 months free.
export const PRICING = {
  monthly: 297,
  annual: 2970,
  trialDays: 14,
} as const

export type BillingInterval = 'monthly' | 'annual'

const DAY_MS = 24 * 60 * 60 * 1000

// plan_tier is included so comp accounts (manually set to 'enterprise')
// bypass the pay-wall — see orgHasAccess.
type OrgAccessFields = Pick<Organization, 'subscription_status' | 'created_at' | 'plan_tier'>

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

// Comp / internal accounts: manually set plan_tier to 'enterprise' in the
// DB to grant permanent access regardless of subscription or trial state.
// The Stripe webhook only ever writes 'pro' or 'free', so it never clobbers this.
export function isCompAccount(org: Pick<Organization, 'plan_tier'>): boolean {
  return org.plan_tier === 'enterprise'
}

// Full access = comp account OR paying subscriber OR within the 14-day free trial.
export function orgHasAccess(org: OrgAccessFields): boolean {
  return isCompAccount(org) || hasActiveSubscription(org) || trialDaysLeft(org) > 0
}
