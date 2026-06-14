/*
 * Self-serve UI check: logs into the app with the isolated UI test account and
 * screenshots /app/map at phone / tablet / desktop widths, so UI/layout can be
 * verified without asking anyone for screenshots.
 *
 * Prereqs:
 *   1. `npm run ui:seed` once (creates the comped test account).
 *   2. Dev server running: `npm run dev` (defaults to http://localhost:3000).
 * Run:
 *   npm run ui:check        (or: node --env-file=.env.local scripts/ui-check.mjs)
 *
 * Output: PNGs in .ui-check/ (gitignored). Secrets come from env only.
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.UI_CHECK_BASE || 'http://localhost:3000'
const EMAIL = process.env.UI_TEST_EMAIL
const PASSWORD = process.env.UI_TEST_PASSWORD
const OUT = '.ui-check'

if (!EMAIL || !PASSWORD) {
  console.error('Missing UI_TEST_EMAIL / UI_TEST_PASSWORD in env (.env.local). Run `npm run ui:seed` first.')
  process.exit(1)
}

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'ipad', width: 810, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
]

async function shoot(browser, vp) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
  const page = await context.newPage()
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('#email', EMAIL)
    await page.fill('#password', PASSWORD)
    await Promise.all([
      page.waitForURL('**/app/map', { timeout: 30_000 }),
      page.click('button[type="submit"]'),
    ])
    // Let the map canvas mount and tiles settle.
    await page.waitForSelector('.mapboxgl-canvas', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(3000)
    const file = `${OUT}/${vp.name}-map.png`
    await page.screenshot({ path: file })
    console.log(`✓ ${vp.name.padEnd(8)} ${vp.width}x${vp.height} → ${file}`)
  } catch (e) {
    console.error(`✗ ${vp.name}: ${e.message}`)
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch()
await mkdir(OUT, { recursive: true })
console.log(`UI check against ${BASE} as ${EMAIL}`)
for (const vp of VIEWPORTS) await shoot(browser, vp)
await browser.close()
console.log('\nDone. Screenshots in', OUT)
