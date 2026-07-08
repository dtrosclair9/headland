/*
 * One-off: reset the isolated UI Test Farm with angled blocks that have
 * varieties + cuts + TWO plantations, so the Layers panel shows all three
 * filter groups. Secrets from env. Run:
 *   node --env-file=.env.local scripts/reseed-ui-test.mjs
 */
import pg from 'pg'

const DB = process.env.SUPABASE_DB_URL
const EMAIL = process.env.UI_TEST_EMAIL
const client = new pg.Client({ connectionString: DB })
await client.connect()

const org = (
  await client.query(
    `select o.id from organizations o join auth.users u on u.id=o.owner_id
     where u.email=$1 and o.name='UI Test Farm' limit 1`,
    [EMAIL],
  )
).rows[0]
if (!org) throw new Error('UI Test Farm not found — run npm run ui:seed first')

await client.query('delete from fields where org_id=$1', [org.id])
await client.query('delete from plantations where org_id=$1', [org.id])

const p1 = (
  await client.query(`insert into plantations (org_id, name) values ($1,'Rosedale') returning id`, [org.id])
).rows[0].id
const p2 = (
  await client.query(`insert into plantations (org_id, name) values ($1,'Waverly') returning id`, [org.id])
).rows[0].id

const specs = [
  { name: '1a', variety: 'L 01-299', ratoon: 'plant_cane', plantation: p1 },
  { name: '2b', variety: 'L 01-299', ratoon: 'first_stubble', plantation: p1 },
  { name: '3c', variety: 'HoCP 96-540', ratoon: 'plant_cane', plantation: p1 },
  { name: '4d', variety: 'HoCP 96-540', ratoon: 'second_stubble', plantation: p2 },
  { name: '5e', variety: 'L 01-299', ratoon: 'plant_cane', plantation: p2 },
  { name: '6f', variety: null, ratoon: 'fallow', plantation: null },
]
const baseLng = -91.05
const baseLat = 29.95
for (let i = 0; i < specs.length; i++) {
  const s = specs[i]
  const ox = baseLng + (i % 3) * 0.005
  const oy = baseLat + Math.floor(i / 3) * 0.0045
  const skew = 0.0006 + (i % 3) * 0.0004
  const rise = 0.0003 * (i % 2 === 0 ? 1 : -1)
  const w = 0.0034
  const h = 0.0032
  const ring = [
    [ox, oy],
    [ox + w, oy + rise],
    [ox + w + skew, oy + h + rise],
    [ox + skew, oy + h],
    [ox, oy],
  ]
  const gj = JSON.stringify({ type: 'Polygon', coordinates: [ring] })
  await client.query(
    `insert into fields (org_id, name, variety, current_ratoon, plantation_id, geometry, acreage_cached, arpents_cached)
     select $1,$2,$3,$4::ratoon_stage,$5, g::geography,
            round((ST_Area(g::geography)*0.000247105)::numeric,2),
            round((ST_Area(g::geography)*0.000247105/0.84628)::numeric,2)
     from (select ST_GeomFromGeoJSON($6) g) s`,
    [org.id, s.name, s.variety, s.ratoon, s.plantation, gj],
  )
}
console.log('reseeded 6 blocks across Rosedale/Waverly/unassigned')
await client.end()
