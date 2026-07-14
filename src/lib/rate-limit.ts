import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

// Fixed-window rate limiter backed by our own Postgres (no extra service).
// Returns true if the request is ALLOWED, false if the caller is over the
// limit. Fail-OPEN: if the limiter itself errors we allow the request — an
// outage in the guard must never take down the feature it protects.
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('rate_limit_hit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    })
    if (error) return true
    return data === true
  } catch {
    return true
  }
}

// Best-effort client IP for keying pre-login actions (signup, password reset)
// where there's no org/user yet. Vercel sets x-forwarded-for.
export async function clientIp(): Promise<string> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? 'unknown'
}
