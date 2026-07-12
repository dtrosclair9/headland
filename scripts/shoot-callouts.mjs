/*
 * Torture-test the print label ladder on synthetic block shapes — long
 * slivers, short fat blocks, tiny squares, adjacent slivers — and screenshot
 * the result. Pure builder, no DB. Run: node scripts/shoot-callouts.mjs
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
register('./alias-hook.mjs', pathToFileURL('./scripts/'))

const { buildPlantationSvg } = await import('../src/lib/plantation-map-svg.ts')
const { plantationSvgMarkup } = await import('../src/lib/print-markup.ts')
const { chromium } = await import('playwright')
import { writeFileSync } from 'node:fs'

// ~meters to degrees near 29.8N
const MLat = 1 / 111000
const MLng = 1 / (111000 * Math.cos((29.8 * Math.PI) / 180))
const O = [-90.8, 29.8]

let n = 0
function rect(x, y, w, h, name, variety, ratoon, acres, skew = 0) {
  n++
  const ring = [
    [x, y],
    [x + w * MLng, y + skew * MLat],
    [x + w * MLng + 0, y + (h + skew) * MLat],
    [x, y + h * MLat],
    [x, y],
  ]
  return {
    id: `t${n}`,
    name,
    variety,
    current_ratoon: ratoon,
    acreage_cached: acres,
    arpents_cached: acres * 1.18,
    centroid_lng: x + (w / 2) * MLng,
    centroid_lat: y + ((h + skew) / 2) * MLat,
    geometry: { type: 'Polygon', coordinates: [ring] },
  }
}

const X = (m) => O[0] + m * MLng
const Y = (m) => O[1] + m * MLat

const blocks = [
  // Big comfortable block — should take the corner layout.
  rect(X(0), Y(0), 500, 400, '1', 'L 01-299', 'plant_cane', 28.29),
  // Long thin strip — rails or single line along the axis.
  rect(X(550), Y(0), 750, 55, '2a', 'HoCP 96-540', 'first_stubble', 9.4),
  // Long thin strip, skewed hard (leaning diagonal).
  rect(X(550), Y(120), 750, 50, '2b', 'L 01-283', 'second_stubble', 8.7, 260),
  // Short fat block — stacked rows.
  rect(X(0), Y(470), 150, 110, '3', 'L 12-201', 'third_stubble', 3.9),
  // Tiny square — callout territory.
  rect(X(220), Y(470), 55, 50, '4', 'HoCP 04-838', 'plant_cane', 0.7),
  // Two ADJACENT tiny slivers — chips must not collide.
  rect(X(340), Y(470), 190, 26, '8a', 'L 01-299', 'fourth_stubble', 1.2),
  rect(X(340), Y(505), 190, 26, '8b', 'L 01-299', 'fifth_stubble_plus', 1.1),
  // Tiny sliver jammed against the big block.
  rect(X(0), Y(415), 260, 24, '5', 'Ho 07-613', 'second_stubble', 1.4),
  // Medium tilted block.
  rect(X(600), Y(300), 300, 220, '6', 'L 14-267', 'sixth_stubble_plus', 14.6, 120),
  // Micro block — even the id won't fit.
  rect(X(950), Y(560), 30, 28, '7c', 'L 01-299', 'fallow', 0.3),
]

for (const paper of ['letter', 'tabloid']) {
  const svg = buildPlantationSvg(blocks, { paper })
  console.log(`${paper}: ${svg.callouts.length} callouts`)
  const markup = plantationSvgMarkup(svg, false)
  writeFileSync(
    `.ui-check/callouts-${paper}.html`,
    `<!doctype html><body style="margin:0;background:#fff">${markup.replace('<svg ', '<svg style="width:1600px;height:auto;display:block" ')}</body>`,
  )
}

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1100 } })).newPage()
for (const paper of ['letter', 'tabloid']) {
  await page.goto(pathToFileURL(`.ui-check/callouts-${paper}.html`).href)
  await page.screenshot({ path: `.ui-check/callouts-${paper}.png`, fullPage: true })
}
await browser.close()
console.log('shots done')
