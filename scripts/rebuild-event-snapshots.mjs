/*
 * Regenerate operation_events.snapshot_svg with the current snapshot builder
 * (context blocks quiet, no chip storm). Mirrors the bulk route's build:
 * spray style, touched plantations as scope, canvasWidth 900. Run:
 *   node --env-file=.env.local scripts/rebuild-event-snapshots.mjs
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
register('./alias-hook.mjs', pathToFileURL('./scripts/'))

const { buildSpraySvg } = await import('../src/lib/plantation-map-svg.ts')
const { plantationSvgMarkup } = await import('../src/lib/print-markup.ts')
const postgres = (await import('postgres')).default
import { writeFileSync } from 'node:fs'

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', prepare: false, max: 1 })
try {
  const events = await sql`
    select id, org_id, title, color, block_ids from operation_events
    where snapshot_svg is not null`
  console.log(`${events.length} events with snapshots`)
  for (const ev of events) {
    const org = (await sql`select units_default from organizations where id = ${ev.org_id}`)[0]
    const allBlocks = await sql`
      select id, name, variety, current_ratoon, acreage_cached, arpents_cached, plantation_id,
             st_x(centroid::geometry) as centroid_lng, st_y(centroid::geometry) as centroid_lat,
             st_asgeojson(geometry)::json as geometry
      from fields where org_id = ${ev.org_id}`
    const anns = await sql`
      select id, kind, color, text, size, rotation, geometry
      from map_annotations where org_id = ${ev.org_id}`
    const pls = await sql`select id, name from plantations where org_id = ${ev.org_id}`
    const plName = new Map(pls.map((p) => [p.id, p.name]))
    const idSet = new Set(ev.block_ids)
    const targets = allBlocks.filter((b) => idSet.has(b.id))
    if (!targets.length) continue
    const scope = new Set(targets.map((b) => b.plantation_id ?? '__none'))
    const contextBlocks = allBlocks.filter((b) => scope.has(b.plantation_id ?? '__none'))
    // One sheet per plantation, same as the bulk route.
    const groups = new Map()
    for (const b of contextBlocks) {
      const k = b.plantation_id ?? null
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(b)
    }
    let chips = 0
    const markup = Array.from(groups.entries())
      .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : (plName.get(a) ?? '').localeCompare(plName.get(b) ?? '')))
      .map(([k, blocks]) => {
        const svg = buildSpraySvg(blocks, {
          unitsArpents: org.units_default === 'arpents',
          annotations: anns,
          highlight: { ids: idSet, color: ev.color ?? '#DC2626' },
          canvasWidth: 900,
        })
        if (!svg) return ''
        chips += svg.callouts.length
        const name = (k ? plName.get(k) : null) ?? 'Unassigned'
        const title = `<text x="10" y="21" font-size="15" font-weight="700" fill="#1A3D2E">${name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`
        return plantationSvgMarkup(svg, true).replace('</svg>', `${title}</svg>`)
      })
      .join('')
    if (!markup) continue
    await sql`update operation_events set snapshot_svg = ${markup} where id = ${ev.id}`
    console.log(`rebuilt: ${ev.title} (${targets.length} blocks, ${chips} callouts across ${groups.size} sheets)`)
    writeFileSync(
      `.ui-check/event-${ev.id.slice(0, 8)}.html`,
      `<!doctype html><body style="margin:0;background:#fff">${markup.replaceAll('<svg ', '<svg style="width:1600px;height:auto;display:block" ')}</body>`,
    )
  }
} finally {
  await sql.end({ timeout: 5 })
}
console.log('done')
