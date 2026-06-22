import type { Organization } from '@/lib/types'

export type BillingInterval = 'monthly' | 'annual'

// ---------------------------------------------------------------------------
// Per-acre pricing, matched to the market.
//
//   • Base plan: $0.50/acre/yr — covers EVERY acre and your WHOLE CREW.
//     Data-entry / crew seats are free; there is no setup fee and no floor.
//   • Additional full-access manager seats: $1,000/yr each (Phase 2 — seat
//     billing + role split not yet wired into checkout).
//
//   Monthly = annual ÷ 10, so paying annually is literally "two months free"
//   ($0.50/ac/yr → $0.05/ac/mo; a $1,000 seat → $100/mo).
//
// These constants MUST match the Stripe Price objects created by
// scripts/create-stripe-prices.cjs and the checks in
// scripts/verify-pricing.mjs.
// ---------------------------------------------------------------------------

export const PER_ACRE_ANNUAL = 0.5
export const MANAGER_SEAT_ANNUAL = 1000

export const PRICING = {
  trialDays: 14,
  perAcreAnnual: PER_ACRE_ANNUAL,
  managerSeatAnnual: MANAGER_SEAT_ANNUAL,
} as const

// Annual base price for a given mapped acreage. Cent precision so it matches
// the Stripe per-unit Price ($0.50/ac) exactly — no rounding drift on odd
// acreages (e.g. 401 ac → $200.50, not $201).
export function annualPrice(acres: number): number {
  return Math.round(Math.max(0, acres) * PER_ACRE_ANNUAL * 100) / 100
}

// Monthly = annual ÷ 10 charged each month (two months free for paying up
// front). Matches the Stripe monthly Price ($0.05/ac) to the cent.
export function monthlyPrice(acres: number): number {
  return Math.round((annualPrice(acres) / 10) * 100) / 100
}

export function priceForInterval(acres: number, interval: BillingInterval): number {
  return interval === 'annual' ? annualPrice(acres) : monthlyPrice(acres)
}

// Effective $/ac/yr (flat $0.50 today; kept as a function so the UI doesn't
// hard-code the rate and Phase 2 seat math can fold in cleanly).
export function effectivePerAcre(acres: number): number {
  if (acres <= 0) return PER_ACRE_ANNUAL
  return annualPrice(acres) / acres
}

// $1,234 or $287.50 — whole dollars unless cents are needed.
export function formatUSD(n: number): string {
  const hasCents = Math.round(n * 100) % 100 !== 0
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}

const DAY_MS = 24 * 60 * 60 * 1000

// comped is included so comp accounts bypass the pay-wall — see orgHasAccess.
type OrgAccessFields = Pick<Organization, 'subscription_status' | 'created_at' | 'comped'>

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

// Comp / internal accounts: set comped = true in the DB to grant permanent
// access regardless of subscription or trial state. Nothing in the Stripe
// sync touches this flag, so a paid subscription can never clobber it.
export function isCompAccount(org: Pick<Organization, 'comped'>): boolean {
  return org.comped
}

// Full access = comp account OR paying subscriber OR within the 14-day free trial.
export function orgHasAccess(org: OrgAccessFields): boolean {
  return isCompAccount(org) || hasActiveSubscription(org) || trialDaysLeft(org) > 0
}
