/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mapbox + React StrictMode double-mount in dev causes the map to leak its
  // WebGL context and render blank after route navigation. This is dev-only
  // behavior — production never strict-mounts. Disabling makes the dev
  // experience match production for the map; revisit if we ever want strict
  // checks back on for other components.
  reactStrictMode: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  experimental: {
    // Server actions handle scouting photo uploads — give them headroom.
    serverActions: { bodySizeLimit: '15mb' },
  },
  // Security headers on every route. The CSP is the defense-in-depth layer
  // against XSS: even if malicious markup slipped in, the browser would only
  // run/load from these origins. Scoped to exactly what the app uses in the
  // BROWSER — Supabase (data + storage + realtime), Mapbox (tiles/workers),
  // Stripe (checkout). Server-side fetches (weather, translation, burn
  // category) don't go through the browser, so they need no entry here.
  // 'unsafe-inline'/'unsafe-eval' are required by Next's hydration and
  // Mapbox GL's WebGL/worker code; the origin allowlists are the real value.
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
      "img-src 'self' data: blob: https://*.supabase.co https://*.mapbox.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://events.mapbox.com https://api.stripe.com",
      "worker-src 'self' blob:",
      "font-src 'self' data:",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ')
    const securityHeaders = [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), browsing-topics=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
    ]
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  // "Sections" was renamed to "Plantations" (grower terminology). Redirect the
  // old URLs so any bookmarks / printed links keep working.
  async redirects() {
    return [
      { source: '/app/sections', destination: '/app/plantations', permanent: true },
      { source: '/sections/:id/print', destination: '/plantations/:id/print', permanent: true },
    ]
  },
}

module.exports = nextConfig
