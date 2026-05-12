#!/usr/bin/env node
const postgres = require('postgres')

async function main() {
  const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', prepare: false, max: 1 })
  try {
    const tables = await sql`
      select table_name from information_schema.tables
      where table_schema = 'public' order by table_name
    `
    console.log('public tables:', tables.map(t => t.table_name).join(', '))

    const ext = await sql`select extname from pg_extension where extname in ('postgis','pgcrypto')`
    console.log('extensions:', ext.map(e => e.extname).join(', '))

    const policies = await sql`
      select tablename, count(*) as n from pg_policies
      where schemaname = 'public' group by tablename order by tablename
    `
    console.log('RLS policies per table:')
    for (const p of policies) console.log(`  ${p.tablename}: ${p.n}`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}
main().catch(e => { console.error('✗', e.message); process.exit(1) })
