#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const postgres = require('postgres')

async function main() {
  const url = process.env.SUPABASE_DB_URL
  if (!url) throw new Error('SUPABASE_DB_URL not set in environment')

  const file = process.argv[2]
  if (!file) throw new Error('Usage: node scripts/run-migration.cjs <path-to-sql>')

  const abs = path.resolve(file)
  const content = fs.readFileSync(abs, 'utf8')

  const sql = postgres(url, { ssl: 'require', prepare: false, max: 1 })
  console.log(`→ Running ${file}`)
  try {
    await sql.unsafe(content)
    console.log('✓ Migration applied')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(1)
})
