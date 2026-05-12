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
}

module.exports = nextConfig
