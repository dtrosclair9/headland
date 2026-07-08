/*
 * One-off: verify custom colors end-to-end. Sets plant cane to a custom teal
 * via the real /api/colors route (from the settings page session), then
 * screenshots the settings page, the map, and the crop-map print.
 * Run with dev server up: node --env-file=.env.local scripts/shoot-colors.mjs
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.UI_CHECK_BASE || 'http://localhost:3000'
const EMAIL = process.env.UI_TEST_EMAIL
const PASSWORD = process.env.UI_TEST_PASSWORD
const OUT = '.ui-check'

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('#email', EMAIL)
await page.fill('#password', PASSWORD)
await Promise.all([
  page.waitForURL('**/app/map', { timeout: 30_000 }),
  page.click('button[type="submit"]'),
])

// Set plant cane to a custom color through the real API (same call the
// settings UI makes), plus a custom variety color.
for (const body of [
  { kind: 'stage', key: 'plant_cane', color: '#0EA5E9' },
  { kind: 'variety', key: 'L 01-299', color: '#F97316' },
]) {
  const res = await page.evaluate(async (b) => {
    const r = await fetch('/api/colors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(b),
    })
    return r.status
  }, body)
  if (res !== 200) throw new Error(`api/colors -> ${res}`)
}
console.log('✓ overrides saved via API')

// Settings page shows the custom color + Reset affordance.
await page.goto(`${BASE}/app/settings/colors`, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${OUT}/colors-1-settings.png` })

// Map: plant cane blocks now sky blue.
await page.goto(`${BASE}/app/map`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.mapboxgl-canvas', { timeout: 20_000 }).catch(() => {})
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/colors-2-map.png` })

// Crop-map print: same custom color on the printed sheet + legend.
await page.goto(`${BASE}/app/plantations`, { waitUntil: 'networkidle' }).catch(() => {})
// Print via the blocks route with all block ids (crop style).
const ids = await page.evaluate(async () => {
  const r = await fetch('/api/plantations')
  const d = await r.json()
  return d.plantations?.[0]?.id ?? null
})
if (ids) {
  await page.goto(`${BASE}/plantations/${ids}/print`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/colors-3-print.png`, fullPage: true })
}
console.log('✓ shots done')

// Clean up: reset the overrides so the test farm goes back to defaults.
for (const body of [
  { kind: 'stage', key: 'plant_cane', color: null },
  { kind: 'variety', key: 'L 01-299', color: null },
]) {
  await page.evaluate(async (b) => {
    await fetch('/api/colors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(b),
    })
  }, body)
}
console.log('✓ overrides reset')
await browser.close()
