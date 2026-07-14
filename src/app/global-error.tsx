'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// Root-level error boundary. Fires only when the root layout itself throws
// (a normal error.tsx handles per-route errors). Reports to Sentry so we hear
// about the worst class of failure — the "server-side exception" that took
// Ritchie's map down would surface here. Styles are inline: global-error
// renders its own <html>/<body> outside the app shell, so app CSS may not load.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a1628',
          color: '#e6edf6',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.5, color: '#9fb2cc', margin: '0 0 20px' }}>
            We hit an unexpected error. Our team has been notified. Try again in a
            moment.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#2f8bff',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
