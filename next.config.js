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
  // Security headers on every route. X-Frame-Options guards the login/billing
  // pages against clickjacking. Geolocation is intentionally NOT blocked in
  // Permissions-Policy — the Mapbox map may use it. CSP is deferred: a strict
  // policy needs per-source testing against Mapbox, Supabase, and Stripe.
  async headers() {
    const securityHeaders = [
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
