#!/usr/bin/env node
// Creates the Headland Stripe Prices and prints the IDs to paste into Vercel
// env. Run once per environment (Stripe prices are immutable):
//
//   node --env-file=.env.local scripts/create-stripe-prices.cjs
//
// Creates four prices under one "Headland" product:
//   • Per-acre, annual   — $0.50/ac  (STRIPE_PRICE_ANNUAL)   quantity = acres
//   • Per-acre, monthly  — $0.05/ac  (STRIPE_PRICE_MONTHLY)  quantity = acres
//   • Manager seat, annual  — $1,000  (STRIPE_PRICE_SEAT_ANNUAL)   Phase 2
//   • Manager seat, monthly — $100    (STRIPE_PRICE_SEAT_MONTHLY)  Phase 2
//
// The base $0.50/ac plan covers every acre AND the whole crew (crew logins are
// free). Manager-seat prices are created now but not yet wired into checkout —
// that's Phase 2 (seat billing + role split). Numbers MUST match
// src/lib/billing.ts and scripts/verify-pricing.mjs.

const Stripe = require('stripe')

async function main() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not set (use --env-file=.env.local)')
  const stripe = new Stripe(key)
  console.log(`Stripe mode: ${key.startsWith('sk_live') ? 'LIVE' : 'TEST'}`)

  const product = await stripe.products.create({
    name: 'Headland',
    description: 'Sugarcane field mapping & records — $0.50/acre, whole crew included.',
  })
  console.log(`✓ Product: ${product.id}`)

  // Per-acre base plan. Plain per-unit (no tiers); quantity = mapped acres.
  const acreAnnual = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    recurring: { interval: 'year', usage_type: 'licensed' },
    unit_amount: 50, // $0.50/ac/yr
    metadata: { plan: 'per_acre', interval: 'annual' },
  })
  console.log(`✓ Per-acre annual:  ${acreAnnual.id}`)

  const acreMonthly = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    recurring: { interval: 'month', usage_type: 'licensed' },
    unit_amount: 5, // $0.05/ac/mo (annual ÷ 10)
    metadata: { plan: 'per_acre', interval: 'monthly' },
  })
  console.log(`✓ Per-acre monthly: ${acreMonthly.id}`)

  // Manager-seat add-on (Phase 2). quantity = extra full-access managers.
  const seatAnnual = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    recurring: { interval: 'year', usage_type: 'licensed' },
    unit_amount: 100000, // $1,000/yr per manager seat
    metadata: { plan: 'manager_seat', interval: 'annual' },
  })
  console.log(`✓ Manager seat annual:  ${seatAnnual.id}`)

  const seatMonthly = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    recurring: { interval: 'month', usage_type: 'licensed' },
    unit_amount: 10000, // $100/mo per manager seat
    metadata: { plan: 'manager_seat', interval: 'monthly' },
  })
  console.log(`✓ Manager seat monthly: ${seatMonthly.id}`)

  console.log('\nSet these in Vercel (and .env.local for local testing):\n')
  console.log(`STRIPE_PRICE_ANNUAL=${acreAnnual.id}`)
  console.log(`STRIPE_PRICE_MONTHLY=${acreMonthly.id}`)
  console.log(`STRIPE_PRICE_SEAT_ANNUAL=${seatAnnual.id}`)
  console.log(`STRIPE_PRICE_SEAT_MONTHLY=${seatMonthly.id}`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
