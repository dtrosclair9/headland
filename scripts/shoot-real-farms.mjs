/*
 * READ-ONLY: pull the real Trosclair Farms blocks from prod and render each
 * plantation through the print builder to verify the label ladder on the
 * exact geometry Dayne prints. Run:
 *   node --env-file=.env.local scripts/shoot-real-farms.mjs
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
register('./alias-hook.mjs', pathToFileURL('./scripts/'))

const { buildPlantationSvg } = await import('../src/lib/plantation-map-svg.ts')
const { plantationSvgMarkup } = await import('../src/lib/print-markup.ts')
const postgres = (await import('postgres')).default
const { chromium } = await import('playwright')
import { writeFileSync } from 'node:fs'

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', prepare: false, max: 1 })
const shots = []
try {
  const orgs = await sql`select id, name from organizations where name ilike '%trosclair%'`
  if (!orgs.length) throw new Error('no trosclair org')
  const org = orgs[0]
  const plantations = await sql`
    select id, name from plantations where org_id = ${org.id} order by name`
  for (const pl of plantations) {
    const blocks = await sql`
      select id, name, variety, current_ratoon, acreage_cached, arpents_cached,
             st_x(centroid::geometry) as centroid_lng, st_y(centroid::geometry) as centroid_lat,
             st_asgeojson(geometry)::json as geometry
      from fields where org_id = ${org.id} and plantation_id = ${pl.id}`
    if (blocks.length === 0) continue
    const svg = buildPlantationSvg(blocks, { paper: 'letter' })
    if (!svg) continue
    console.log(`${pl.name}: ${blocks.length} blocks, ${svg.callouts.length} callouts`)
    const slug = pl.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const file = `.ui-check/real-${slug}.html`
    writeFileSync(
      file,
      `<!doctype html><body style="margin:0;background:#fff">${plantationSvgMarkup(svg, false).replace('<svg ', '<svg style="width:1600px;height:auto;display:block" ')}</body>`,
    )
    shots.push({ file, png: `.ui-check/real-${slug}.png` })
  }
} finally {
  await sql.end({ timeout: 5 })
}

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1200 } })).newPage()
for (const s of shots) {
  await page.goto(pathToFileURL(s.file).href)
  await page.screenshot({ path: s.png, fullPage: true })
}
await browser.close()
console.log('done:', shots.map((s) => s.png).join(', '))
