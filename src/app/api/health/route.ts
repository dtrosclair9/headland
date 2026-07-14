import { NextResponse } from 'next/server'

// Lightweight health check for uptime monitors (Sentry Uptime, etc.). Returns
// 200 when the app can serve — no DB call, so it reflects app liveness, not
// database load. Point an uptime monitor at /api/health.
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() })
}
