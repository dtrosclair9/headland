/*
 * Backfill record-keeping data onto existing operation_events: point-in-time
 * snapshot_blocks (from current fields — block data hasn't changed since
 * these events were logged), daily weather at the field, and Spanish notes.
 * Run: node --env-file=.env.local scripts/backfill-event-records.mjs
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
register('./alias-hook.mjs', pathToFileURL('./scripts/'))

const { fetchOperationWeather } = await import('../src/lib/operation-weather.ts')
const { translateToSpanish } = await import('../src/lib/translate.ts')
const postgres = (await import('postgres')).default

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', prepare: false, max: 1 })
try {
  const events = await sql`
    select id, org_id, title, detail, detail_es, block_ids, occurred_at, snapshot_blocks, weather
    from operation_events`
  console.log(`${events.length} events`)
  for (const ev of events) {
    const updates = {}
    const allBlocks = await sql`
      select f.id, f.name, f.variety, f.current_ratoon, f.acreage_cached, f.arpents_cached,
             f.plantation_id, p.name as plantation_name,
             st_x(f.centroid::geometry) as centroid_lng, st_y(f.centroid::geometry) as centroid_lat,
             st_asgeojson(f.geometry)::json as geometry
      from fields f left join plantations p on p.id = f.plantation_id
      where f.org_id = ${ev.org_id}`
    const idSet = new Set(ev.block_ids ?? [])
    const targets = allBlocks.filter((b) => idSet.has(b.id))
    if (!targets.length) continue
    if (!ev.snapshot_blocks) {
      const scope = new Set(targets.map((b) => b.plantation_id ?? '__none'))
      updates.snapshot_blocks = allBlocks.filter((b) => scope.has(b.plantation_id ?? '__none'))
    }
    if (!ev.weather) {
      const lat = targets.reduce((s, b) => s + b.centroid_lat, 0) / targets.length
      const lng = targets.reduce((s, b) => s + b.centroid_lng, 0) / targets.length
      const occurredAt =
        ev.occurred_at instanceof Date
          ? ev.occurred_at.toISOString().slice(0, 10)
          : String(ev.occurred_at).slice(0, 10)
      updates.weather = await fetchOperationWeather(lat, lng, occurredAt, null)
    }
    if (ev.detail && ev.detail !== ev.title && !ev.detail_es) {
      updates.detail_es = await translateToSpanish(ev.detail)
    }
    if (Object.keys(updates).length === 0) continue
    await sql`update operation_events set ${sql(updates)} where id = ${ev.id}`
    console.log(
      `backfilled ${ev.title}: ${Object.keys(updates).join(', ')}` +
        (updates.weather ? ` — ${updates.weather.summary}` : ''),
    )
  }
} finally {
  await sql.end({ timeout: 5 })
}
console.log('done')
