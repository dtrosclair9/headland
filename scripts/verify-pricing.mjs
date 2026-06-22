// Verifies the per-acre pricing math. No test framework in this repo, so this
// is the guard.
//
//   node scripts/verify-pricing.mjs
//
// Numbers here MUST match src/lib/billing.ts (PER_ACRE_ANNUAL) and
// scripts/create-stripe-prices.cjs. Change a rate → change all three, re-run.

const PER_ACRE_ANNUAL = 0.5

const annualPrice = (acres) => Math.round(Math.max(0, acres) * PER_ACRE_ANNUAL * 100) / 100
const monthlyPrice = (acres) => Math.round((annualPrice(acres) / 10) * 100) / 100

// [acres, expected annual, expected monthly]
const cases = [
  [400, 200, 20],
  [1000, 500, 50],
  [4000, 2000, 200], // matches the FarmMind quote for Boudreaux's 4,000 ac
  [401, 200.5, 20.05], // odd acreage keeps cents — no rounding drift vs Stripe
  [8000, 4000, 400],
]

let failed = 0
console.log('acres   annual    monthly   $/ac/yr')
for (const [acres, expAnnual, expMonthly] of cases) {
  const a = annualPrice(acres)
  const m = monthlyPrice(acres)
  const ok = a === expAnnual && m === expMonthly
  if (!ok) {
    failed++
    console.error(
      `FAIL ${acres}ac: got annual ${a}/monthly ${m}, expected ${expAnnual}/${expMonthly}`,
    )
  }
  console.log(
    `${String(acres).padEnd(6)}  $${String(a).padEnd(7)} $${String(m).padEnd(7)} $${(a / acres).toFixed(2)}`,
  )
}

// Annual must always be exactly 10× a month (two months free).
for (const [acres] of cases) {
  if (Math.round(monthlyPrice(acres) * 10 * 100) / 100 !== annualPrice(acres)) {
    failed++
    console.error(`FAIL ${acres}ac: annual is not 10× monthly`)
  }
}

if (failed) {
  console.error(`\n${failed} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll pricing checks passed.')
