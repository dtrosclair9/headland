#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js')

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const secret = process.env.SUPABASE_SECRET_KEY

  if (!url || !publishable || !secret) {
    throw new Error('Missing Supabase env vars')
  }

  // Publishable key — should connect, but auth.admin.listUsers will fail (correctly).
  const pub = createClient(url, publishable)
  const pubAttempt = await pub.auth.admin.listUsers()
  if (!pubAttempt.error) {
    throw new Error('SECURITY: publishable key was allowed admin access')
  }
  console.log('✓ Publishable key has correct (limited) scope')

  // Secret key — should succeed at admin operations.
  const adm = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await adm.auth.admin.listUsers()
  if (error) throw new Error(`Secret key failed: ${error.message}`)
  console.log(`✓ Secret key works — auth.users count: ${data.users.length}`)
}

main().catch((e) => { console.error('✗', e.message); process.exit(1) })
