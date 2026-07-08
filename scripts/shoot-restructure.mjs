/*
 * One-off E2E for the layers restructure: Layers-first tab, select/deselect
 * all, white map, highlight print with context blocks, fly plan create →
 * view → print. Run with dev server up:
 *   node --env-file=.env.local scripts/shoot-restructure.mjs
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.UI_CHECK_BASE || 'http://localhost:3000'
const OUT = '.ui-check'

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 2000, height: 1100 } })
const page = await ctx.newPage()

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('#email', process.env.UI_TEST_EMAIL)
await page.fill('#password', process.env.UI_TEST_PASSWORD)
await Promise.all([
  page.waitForURL('**/app/map', { timeout: 30_000 }),
  page.click('button[type="submit"]'),
])
await page.waitForSelector('.mapboxgl-canvas', { timeout: 20_000 })
await page.waitForTimeout(3000)

// 1. Default: Layers tab first + select-all colors + no Spray map button +
//    toolbar not overlapping the toggle.
const sprayBtn = await page.getByRole('button', { name: 'Spray map' }).count()
if (sprayBtn !== 0) throw new Error('Spray map toggle still present')
console.log('✓ spray toggle gone')
await page.screenshot({ path: `${OUT}/rs-1-default.png` })

// 2. Deselect all → white map (crop view shows the pilot map, labels on).
await page.getByRole('button', { name: 'Crop map' }).click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: 'Deselect all' }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/rs-2-whitemap.png` })

// 3. Check Plant cane → those blocks color up.
await page.getByRole('button', { name: /Plant cane/ }).first().click()
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/rs-3-plantcane.png` })

// 4. Highlight print: all blocks with only plant cane colored.
const printHref = await page
  .getByRole('link', { name: /Print these/ })
  .getAttribute('href')
if (!printHref?.includes('highlight=1')) throw new Error(`print link missing highlight: ${printHref}`)
await page.goto(`${BASE}${printHref}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/rs-4-highlight-print.png`, fullPage: true })
console.log('✓ highlight print')

// 5. Fly plan: create → pick 2 blocks → save → view.
await page.goto(`${BASE}/app/map`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.mapboxgl-canvas', { timeout: 20_000 })
await page.waitForTimeout(3000)
await page.getByRole('button', { name: '+ New fly plan' }).click()
await page.fill('input[placeholder*="1st spray"]', '1st spray')
const pickBtn = page.getByRole('button', { name: 'Pick blocks on map →' })
await pickBtn.scrollIntoViewIfNeeded()
await page.waitForTimeout(200)
await pickBtn.click()
await page.waitForTimeout(600)
// Tap two blocks (test farm blocks sit mid-map at this viewport).
await page.mouse.click(650, 800)
await page.waitForTimeout(400)
await page.mouse.click(1120, 320)
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/rs-5-plan-picking.png` })
await page.getByRole('button', { name: 'Save fly plan' }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/rs-6-plan-view.png` })
console.log('✓ plan saved + viewing')

// 6. Plan print.
const plan = await page.evaluate(async () => {
  const r = await fetch('/api/fly-plans')
  return (await r.json()).plans?.[0] ?? null
})
if (!plan) throw new Error('plan not saved')
await page.goto(`${BASE}/fly-plans/${plan.id}/print`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/rs-7-plan-print.png`, fullPage: true })
console.log('✓ plan print')

// 7. Clean up the test plan.
await page.goto(`${BASE}/app/map`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.evaluate(async (id) => {
  await fetch(`/api/fly-plans/${id}`, { method: 'DELETE' })
}, plan.id)
console.log('✓ cleaned up')
await browser.close()
console.log('done')
