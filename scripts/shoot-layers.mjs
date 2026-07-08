/*
 * One-off: drive the Layers tab end-to-end and screenshot each filter state at
 * desktop/phone/iPad widths. Run with dev server up:
 *   node --env-file=.env.local scripts/shoot-layers.mjs
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.UI_CHECK_BASE || 'http://localhost:3000'
const EMAIL = process.env.UI_TEST_EMAIL
const PASSWORD = process.env.UI_TEST_PASSWORD
const OUT = '.ui-check'

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await Promise.all([
    page.waitForURL('**/app/map', { timeout: 30_000 }),
    page.click('button[type="submit"]'),
  ])
  await page.waitForSelector('.mapboxgl-canvas', { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(2500)
}

// Desktop: walk the whole filter flow.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await login(page)
  await page.getByRole('button', { name: 'Layers' }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/layers-1-baseline.png` })

  await page.getByRole('button', { name: /Plant cane/ }).first().click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/layers-2-plantcane.png` })

  await page.getByRole('button', { name: /L 01-299/ }).first().click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/layers-3-stacked-variety.png` })

  await page.getByRole('button', { name: /Rosedale/ }).first().click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/layers-4-triple-plantation.png` })

  // Clear, then flip the palette to variety.
  await page.getByRole('button', { name: 'Clear all' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Variety', exact: true }).click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/layers-5-colorby-variety.png` })
  console.log('✓ desktop flow')
  await ctx.close()
}

// Phone: drawer + layers tab.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await login(page)
  await page.getByRole('button', { name: /Blocks \(\d+\)/ }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Layers' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Plant cane/ }).first().click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/layers-6-phone.png` })
  console.log('✓ phone')
  await ctx.close()
}

// iPad: sidebar open + a stacked filter.
{
  const ctx = await browser.newContext({ viewport: { width: 810, height: 1180 } })
  const page = await ctx.newPage()
  await login(page)
  await page.getByRole('button', { name: 'Layers' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Plant cane/ }).first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/layers-7-ipad.png` })
  console.log('✓ ipad')
  await ctx.close()
}

await browser.close()
console.log('done →', OUT)
