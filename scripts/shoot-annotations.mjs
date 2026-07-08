/*
 * One-off: drive the annotation tools end-to-end — draw a reference line,
 * place a text label, verify on satellite + crop map + both print styles,
 * then verify the delete popup. Run with dev server up:
 *   node --env-file=.env.local scripts/shoot-annotations.mjs
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
await page.waitForSelector('.mapboxgl-canvas', { timeout: 20_000 })
await page.waitForTimeout(3000)

// Close the sidebar so map clicks land where we aim.
const closeBtn = page.locator('button[aria-label="Close fields panel"]').first()
if (await closeBtn.count()) await closeBtn.click()
await page.waitForTimeout(400)

// 1. Draw a reference line across the farm (a "road").
await page.getByRole('button', { name: 'Line', exact: true }).click()
await page.waitForTimeout(300)
await page.mouse.click(500, 640)
await page.waitForTimeout(250)
await page.mouse.click(800, 600)
await page.waitForTimeout(250)
await page.mouse.dblclick(1100, 560)
await page.waitForTimeout(1200)
console.log('✓ line drawn')

// 2. Place a text label.
await page.getByRole('button', { name: 'Text', exact: true }).click()
await page.waitForTimeout(300)
await page.mouse.click(760, 700)
await page.waitForTimeout(400)
await page.fill('input[placeholder*="Hwy"]', 'Hwy 308')
await page.getByRole('button', { name: 'Add', exact: true }).click()
await page.waitForTimeout(1200)
console.log('✓ text placed')

await page.screenshot({ path: `${OUT}/ann-1-satellite.png` })

// 3. Crop-map view keeps annotations on the white sheet.
await page.getByRole('button', { name: 'Crop map' }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/ann-2-cropmap.png` })

// 4. Prints — crop + spray.
const pid = await page.evaluate(async () => {
  const r = await fetch('/api/plantations')
  const d = await r.json()
  return d.plantations?.[0]?.id ?? null
})
if (pid) {
  await page.goto(`${BASE}/plantations/${pid}/print`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/ann-3-print-crop.png`, fullPage: true })
  await page.goto(`${BASE}/plantations/${pid}/print?style=spray`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/ann-4-print-spray.png`, fullPage: true })
  console.log('✓ prints shot')
}

// 5. Delete popup: click the text label on the map.
await page.goto(`${BASE}/app/map`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.mapboxgl-canvas', { timeout: 20_000 })
await page.waitForTimeout(3000)
const close2 = page.locator('button[aria-label="Close fields panel"]').first()
if (await close2.count()) await close2.click()
await page.waitForTimeout(400)
await page.mouse.click(760, 700)
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/ann-5-delete-popup.png` })

// 6. Clean up through the real API.
const n = await page.evaluate(async () => {
  const r = await fetch('/api/annotations')
  const d = await r.json()
  for (const a of d.annotations ?? []) {
    await fetch(`/api/annotations/${a.id}`, { method: 'DELETE' })
  }
  return d.annotations?.length ?? 0
})
console.log(`✓ cleaned up ${n} annotations`)
await browser.close()
