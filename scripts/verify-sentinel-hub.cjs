#!/usr/bin/env node
// Smoke test: can we get an OAuth token from Sentinel Hub on CDSE?
const TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'

async function main() {
  const id = process.env.SENTINEL_HUB_CLIENT_ID
  const secret = process.env.SENTINEL_HUB_CLIENT_SECRET
  if (!id || !secret) {
    throw new Error('SENTINEL_HUB_CLIENT_ID or SENTINEL_HUB_CLIENT_SECRET not set')
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Auth failed (${res.status}): ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  if (!data.access_token) throw new Error('Auth response missing access_token')
  console.log(`✓ Got access token (${data.access_token.length} chars), expires in ${data.expires_in}s`)
}

main().catch((e) => { console.error('✗', e.message); process.exit(1) })
