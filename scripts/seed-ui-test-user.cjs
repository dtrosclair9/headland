#!/usr/bin/env node
/*
 * Seeds (idempotently) an isolated, comped UI self-test account used by
 * scripts/ui-check.mjs to verify the app UI at phone / tablet / desktop widths
 * without needing manual screenshots.
 *
 * SAFE BY DESIGN:
 *  - Reads ALL secrets from env (.env.local) — nothing is hardcoded.
 *  - Creates ONLY its own new org (comped) + a few fake blocks in open LA
 *    farmland. It never reads or writes any other org's data.
 *  - Idempotent: re-running reuses the existing user/org instead of duplicating.
 *
 * Run with:  node --env-file=.env.local scripts/seed-ui-test-user.cjs
 */
const { createClient } = require('@supabase/supabase-js')
const { Client } = require('pg')

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SECRET_KEY
const DB = process.env.SUPABASE_DB_URL
const EMAIL = process.env.UI_TEST_EMAIL
const PASSWORD = process.env.UI_TEST_PASSWORD

if (!URL || !SERVICE || !DB || !EMAIL || !PASSWORD) {
  console.error(
    'Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_DB_URL, UI_TEST_EMAIL, UI_TEST_PASSWORD in .env.local',
  )
  process.exit(1)
}

async function main() {
  const admin = createClient(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const pg = new Client({ connectionString: DB })
  await pg.connect()

  // 1. Auth user (idempotent; keeps password in sync with .env.local).
  const existing = (await pg.query('select id from auth.users where email=$1', [EMAIL])).rows
  let userId
  if (existing.length) {
    userId = existing[0].id
    await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true })
    console.log('reused auth user', userId)
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    })
    if (error) throw error
    userId = data.user.id
    console.log('created auth user', userId)
  }

  // 2. Org (idempotent by owner + name); always comped so it never sees billing gates.
  const orgName = 'UI Test Farm'
  let org = (
    await pg.query('select id from organizations where owner_id=$1 and name=$2', [userId, orgName])
  ).rows[0]
  if (!org) {
    org = (
      await pg.query(
        `insert into organizations (name, owner_id, state, comped) values ($1,$2,'LA',true) returning id`,
        [orgName, userId],
      )
    ).rows[0]
    console.log('created org', org.id)
  } else {
    await pg.query('update organizations set comped=true where id=$1', [org.id])
    console.log('reused org', org.id)
  }

  // 3. Membership (idempotent; accepted so getCurrentOrg() resolves it).
  await pg.query(
    `insert into memberships (org_id, user_id, role, accepted_at)
       values ($1,$2,'owner', now())
     on conflict (org_id, user_id)
       do update set accepted_at = excluded.accepted_at, role = 'owner'`,
    [org.id, userId],
  )
  console.log('ensured membership')

  // 4. Seed a few fake blocks (only if the org has none yet) in open LA farmland.
  const have = (await pg.query('select count(*)::int n from fields where org_id=$1', [org.id])).rows[0].n
  if (have === 0) {
    const baseLng = -91.05
    const baseLat = 29.95
    for (let i = 0; i < 6; i++) {
      const ox = baseLng + (i % 3) * 0.004
      const oy = baseLat + Math.floor(i / 3) * 0.004
      const ring = [
        [ox, oy],
        [ox + 0.0032, oy],
        [ox + 0.0032, oy + 0.003],
        [ox, oy + 0.003],
        [ox, oy],
      ]
      const gj = JSON.stringify({ type: 'Polygon', coordinates: [ring] })
      await pg.query(
        `insert into fields (org_id, name, geometry, acreage_cached, arpents_cached)
         select $1, $2, g::geography,
                round((ST_Area(g::geography)*0.000247105)::numeric,2),
                round((ST_Area(g::geography)*0.000247105/0.84628)::numeric,2)
         from (select ST_GeomFromGeoJSON($3) g) s`,
        [org.id, 'Test ' + (i + 1), gj],
      )
    }
    console.log('seeded 6 test blocks')
  } else {
    console.log('blocks already present:', have)
  }

  await pg.end()
  console.log('\nDone. Log in at /login with UI_TEST_EMAIL / UI_TEST_PASSWORD from .env.local')
}

main().catch((e) => {
  console.error('SEED ERROR:', e.message)
  process.exit(1)
})
