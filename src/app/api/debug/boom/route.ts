import { NextResponse, type NextRequest } from 'next/server'

// TEMPORARY Sentry Slack-routing test. Guarded behind a secret key. Throws a
// DISTINCT error (new fingerprint => new Sentry issue) so it trips the
// "a new issue is created" alert and posts to Slack. DELETE after verifying.
export const dynamic = 'force-dynamic'

export function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')
  if (key !== 'strykora-sentry-smoke-8f2a91') {
    return NextResponse.json({ ok: true }, { status: 200 })
  }
  throw new Error(
    'Headland Slack-alert routing test v2 — confirms error issues reach #monitoring-code. Safe to resolve.',
  )
}
