import { NextResponse, type NextRequest } from 'next/server'

// TEMPORARY Sentry smoke test. Guarded behind a secret key so nothing public
// can trip it and the uptime bot never hits this path. Throws one intentional
// error so we can watch capture -> Sentry -> Slack -> phone end to end.
// DELETE this file after verifying.
export const dynamic = 'force-dynamic'

export function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')
  if (key !== 'strykora-sentry-smoke-8f2a91') {
    return NextResponse.json({ ok: true }, { status: 200 })
  }
  throw new Error(
    'Sentry smoke test — intentional error from /api/debug/boom. Safe to ignore/resolve.',
  )
}
