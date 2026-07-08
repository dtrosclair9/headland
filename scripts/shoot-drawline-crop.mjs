/*
 * One-off: verify line-drawing feedback (vertex dots + rubber-band) is visible
 * on the CROP MAP view, and that the toolbar no longer overlaps the view
 * toggle. Screenshots mid-draw, then cancels (nothing saved).
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.UI_CHECK_BASE || 'http://localhost:3000'
const OUT = '.ui-check'

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()
// Wide desktop — the width where the toolbar collided with the view toggle.
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

// Crop map view, then start a line and click three points — screenshot MID-draw
// so the vertex dots + in-progress line must be visible.
await page.getByRole('button', { name: 'Crop map' }).click()
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Line', exact: true }).click()
await page.waitForTimeout(300)
await page.mouse.click(900, 700)
await page.waitForTimeout(300)
await page.mouse.click(1200, 620)
await page.waitForTimeout(300)
await page.mouse.move(1450, 560)
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/drawline-crop-middraw.png` })
console.log('✓ mid-draw shot')

// CANCEL — the button must NOT save the in-progress line.
await page.getByRole('button', { name: 'Cancel line' }).click()
await page.waitForTimeout(800)
let anns = await page.evaluate(async () => {
  const r = await fetch('/api/annotations')
  return (await r.json()).annotations ?? []
})
if (anns.length !== 0) throw new Error(`cancel STILL saved the line — ${anns.length} annotation(s)`) 
console.log('✓ cancel saved nothing')
await page.screenshot({ path: `${OUT}/drawline-crop-cancelled.png` })

// Normal finish must STILL save.
await page.getByRole('button', { name: 'Line', exact: true }).click()
await page.waitForTimeout(300)
await page.mouse.click(900, 750)
await page.waitForTimeout(250)
await page.mouse.dblclick(1250, 680)
await page.waitForTimeout(1000)
anns = await page.evaluate(async () => {
  const r = await fetch('/api/annotations')
  return (await r.json()).annotations ?? []
})
if (anns.length !== 1) throw new Error(`finish should save exactly 1, got ${anns.length}`)
console.log('✓ double-click finish still saves')

// Esc mid-draw must not save either.
await page.getByRole('button', { name: 'Line', exact: true }).click()
await page.waitForTimeout(300)
await page.mouse.click(950, 800)
await page.waitForTimeout(250)
await page.mouse.click(1150, 760)
await page.waitForTimeout(250)
await page.keyboard.press('Escape')
await page.waitForTimeout(800)
anns = await page.evaluate(async () => {
  const r = await fetch('/api/annotations')
  return (await r.json()).annotations ?? []
})
if (anns.length !== 1) throw new Error(`Esc saved a line — expected 1 annotation, got ${anns.length}`)
console.log('✓ Esc saved nothing')

// Clean up the one legit line.
await page.evaluate(async () => {
  const r = await fetch('/api/annotations')
  for (const a of (await r.json()).annotations ?? []) {
    await fetch(`/api/annotations/${a.id}`, { method: 'DELETE' })
  }
})
console.log('✓ cleaned up')
await browser.close()
console.log('done')
