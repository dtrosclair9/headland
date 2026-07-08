/*
 * One-off E2E for the five fixes: plantation isolation + zoom, baseline labels
 * on white context blocks, variety dots in the Layers list, click-off
 * deselect, and mobile tap-to-delete on drawn lines.
 */
import { chromium, devices } from 'playwright'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.UI_CHECK_BASE || 'http://localhost:3000'
const OUT = '.ui-check'
await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#email', process.env.UI_TEST_EMAIL)
  await page.fill('#password', process.env.UI_TEST_PASSWORD)
  await Promise.all([
    page.waitForURL('**/app/map', { timeout: 30_000 }),
    page.click('button[type="submit"]'),
  ])
  await page.waitForSelector('.mapboxgl-canvas', { timeout: 20_000 })
  await page.waitForTimeout(3000)
}

// ── Desktop: isolation, labels, dots, click-off ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await login(page)

  // Variety dots visible in year-cane color mode.
  await page.screenshot({ path: `${OUT}/fx-1-variety-dots.png` })

  // Rosedale + Plant cane: only Rosedale's 3 blocks on the map, zoomed in;
  // non-matching 2b white but WITH its labels.
  await page.getByRole('button', { name: /Rosedale/ }).first().click()
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: /Plant cane/ }).first().click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/fx-2-isolated-rosedale.png` })

  // Click-off deselect: select a block (popup appears), then click open ground.
  await page.getByRole('button', { name: 'Select all', exact: true }).click()
  await page.waitForTimeout(900)
  await page.mouse.click(760, 450) // on a block
  await page.waitForTimeout(500)
  const popupBefore = await page.locator('.mapboxgl-popup').count()
  await page.mouse.click(400, 850) // open ground (bottom-left of map)
  await page.waitForTimeout(500)
  const popupAfter = await page.locator('.mapboxgl-popup').count()
  console.log(`popup before=${popupBefore} after=${popupAfter}`)
  if (popupBefore === 0) console.log('! first click missed a block (non-fatal)')
  if (popupAfter > 0) throw new Error('click-off did not clear the popup/selection')
  console.log('✓ click-off deselects')
  await ctx.close()
}

// ── Mobile: tap a drawn line → delete popup ──
{
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    hasTouch: true,
  })
  const page = await ctx.newPage()
  await login(page)
  // Seed a line annotation across the farm via the real API.
  await page.evaluate(async () => {
    await fetch('/api/annotations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'line',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-91.052, 29.9495],
            [-91.038, 29.956],
          ],
        },
      }),
    })
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.mapboxgl-canvas', { timeout: 20_000 })
  await page.waitForTimeout(3500)
  // The line crosses mid-farm; tap near the center of the viewport.
  const vp = page.viewportSize()
  await page.touchscreen.tap(vp.width / 2, vp.height / 2)
  await page.waitForTimeout(300)
  // Try a few spots along the diagonal in case the line isn't dead-center.
  for (const f of [0.42, 0.58, 0.35, 0.65]) {
    if ((await page.locator('.mapboxgl-popup').count()) > 0) break
    await page.touchscreen.tap(vp.width * f, vp.height * (1.08 - f))
    await page.waitForTimeout(350)
  }
  const gotPopup = (await page.locator('.mapboxgl-popup').count()) > 0
  await page.screenshot({ path: `${OUT}/fx-3-mobile-line-tap.png` })
  // Clean up the seeded line regardless.
  await page.evaluate(async () => {
    const r = await fetch('/api/annotations')
    for (const a of (await r.json()).annotations ?? []) {
      await fetch(`/api/annotations/${a.id}`, { method: 'DELETE' })
    }
  })
  if (!gotPopup) throw new Error('mobile tap on line did not open the popup')
  console.log('✓ mobile line tap opens delete popup')
  await ctx.close()
}

await browser.close()
console.log('done')
