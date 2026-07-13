/*
 * Stress-test the print label ladder across ALL 15 label-field combinations
 * on every real farm (read-only). Asserts, for every block on every sheet:
 *   - no empty callout chips (bold + text both blank)
 *   - a block with SOMETHING to say gets in-block labels or a chip
 *   - no chip for blocks with nothing to say
 * Run: node --env-file=.env.local scripts/stress-label-combos.mjs
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
register('./alias-hook.mjs', pathToFileURL('./scripts/'))

const { buildPlantationSvg, buildSpraySvg, varietyCode } = await import(
  '../src/lib/plantation-map-svg.ts'
)
const { cutAbbrev } = await import('../src/lib/ratoon-colors.ts')
const postgres = (await import('postgres')).default

const FIELDS = ['name', 'variety', 'cut', 'acres']
const COMBOS = []
for (let m = 1; m < 16; m++) COMBOS.push(FIELDS.filter((_, i) => m & (1 << i)))

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', prepare: false, max: 1 })
let checked = 0
let failures = 0
try {
  const orgs = await sql`select id, name from organizations`
  for (const org of orgs) {
    const pls = await sql`select id, name from plantations where org_id = ${org.id}`
    for (const pl of pls) {
      const blocks = await sql`
        select id, name, variety, current_ratoon, acreage_cached, arpents_cached,
               st_x(centroid::geometry) as centroid_lng, st_y(centroid::geometry) as centroid_lat,
               st_asgeojson(geometry)::json as geometry
        from fields where plantation_id = ${pl.id}`
      if (!blocks.length) continue
      for (const combo of COMBOS) {
        for (const [style, build] of [
          ['crop', buildPlantationSvg],
          ['spray', buildSpraySvg],
        ]) {
          for (const paper of ['letter', 'tabloid']) {
            const svg = build(blocks, { paper, labelFields: new Set(combo) })
            if (!svg) continue
            checked++
            const label = `${pl.name} ${style}/${paper} [${combo.join(',')}]`
            for (const c of svg.callouts) {
              if (!c.bold.trim() && !c.text.trim()) {
                failures++
                console.log(`EMPTY CHIP: ${label}`)
              }
            }
            // per-block: content expected ⇒ labels or a chip near its anchor
            const anchors = new Set(svg.callouts.map((c) => `${c.x1.toFixed(1)},${c.y1.toFixed(1)}`))
            for (let i = 0; i < blocks.length; i++) {
              const b = blocks[i]
              const has = {
                name: !!b.name?.trim() && b.name.trim().toLowerCase() !== 'untitled',
                variety: !!varietyCode(b.variety),
                cut: !!cutAbbrev(b.current_ratoon),
                acres: true,
              }
              const wantsContent = combo.some((f) => has[f])
              const sb = svg.blocks[i]
              const gotLabels = sb.labels.length > 0
              const gotChip = anchors.has(`${sb.labelX.toFixed(1)},${sb.labelY.toFixed(1)}`)
              if (wantsContent && !gotLabels && !gotChip) {
                failures++
                console.log(`SILENT BLOCK: ${label} block=${b.name}`)
              }
              if (!wantsContent && gotChip) {
                failures++
                console.log(`CHIP FOR NOTHING: ${label} block=${b.name}`)
              }
            }
          }
        }
      }
    }
  }
} finally {
  await sql.end({ timeout: 5 })
}
console.log(`${checked} sheets checked, ${failures} failures`)
