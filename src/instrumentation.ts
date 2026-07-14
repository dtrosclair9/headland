import * as Sentry from '@sentry/nextjs'

// Server + edge error monitoring. No-op until NEXT_PUBLIC_SENTRY_DSN is set,
// so this is safe to ship before the Sentry project exists.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

export async function register() {
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? 'development',
    tracesSampleRate: 0.1,
    // don't send local dev noise
    enabled: process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview',
  })
}

// Captures server-component / route-handler exceptions — exactly the class of
// crash that took Ritchie's map down (a Next.js "server-side exception" digest).
export const onRequestError = Sentry.captureRequestError
