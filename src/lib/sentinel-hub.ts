// Sentinel Hub on Copernicus Data Space Ecosystem (CDSE) — modern free tier.
// 30,000 processing units / month. https://documentation.dataspace.copernicus.eu/APIs/SentinelHub.html
//
// To enable: set in .env.local
//   SENTINEL_HUB_CLIENT_ID=...
//   SENTINEL_HUB_CLIENT_SECRET=...
// Generate at: https://shapps.dataspace.copernicus.eu/dashboard/#/account/settings

const TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'
const PROCESS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/process'

let cachedToken: { token: string; expiresAt: number } | null = null

export function isSentinelHubConfigured(): boolean {
  return Boolean(
    process.env.SENTINEL_HUB_CLIENT_ID && process.env.SENTINEL_HUB_CLIENT_SECRET,
  )
}

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.token
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SENTINEL_HUB_CLIENT_ID!,
      client_secret: process.env.SENTINEL_HUB_CLIENT_SECRET!,
    }),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Sentinel Hub auth failed: ${res.status} ${await res.text()}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  }
  return cachedToken.token
}

const NDVI_EVALSCRIPT = /* javascript */ `
//VERSION=3
function setup() {
  return {
    input: ["B04", "B08", "dataMask"],
    output: { bands: 4 }
  };
}
function evaluatePixel(s) {
  if (s.dataMask < 1) return [0, 0, 0, 0];
  const ndvi = (s.B08 - s.B04) / (s.B08 + s.B04);
  // 7-stop ramp: bare/water (red) → stressed (orange) → vigorous (deep green)
  if (ndvi < 0)    return [0.55, 0.55, 0.55, 1];
  if (ndvi < 0.15) return [0.78, 0.21, 0.21, 1];
  if (ndvi < 0.30) return [0.93, 0.55, 0.27, 1];
  if (ndvi < 0.45) return [0.96, 0.78, 0.27, 1];
  if (ndvi < 0.60) return [0.74, 0.85, 0.30, 1];
  if (ndvi < 0.75) return [0.36, 0.71, 0.40, 1];
  return [0.10, 0.45, 0.20, 1];
}
`.trim()

// True-color (natural RGB) — Sentinel-2 bands B04/B03/B02. Gain + soft tone
// curve tuned for the bright Gulf coastal scenes; subtle saturation boost so
// vegetation reads green without going neon.
const TRUE_COLOR_EVALSCRIPT = /* javascript */ `
//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "dataMask"],
    output: { bands: 4 }
  };
}
// Reinhard-ish soft tone-map keeps highlights from clipping while lifting shadows.
function tone(x) {
  const lifted = x * 3.0;
  return lifted / (1 + lifted * 0.55);
}
function evaluatePixel(s) {
  if (s.dataMask < 1) return [0, 0, 0, 0];
  let r = tone(s.B04);
  let g = tone(s.B03);
  let b = tone(s.B02);
  // Saturation boost (mix away from luminance gray).
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const sat = 1.25;
  r = lum + (r - lum) * sat;
  g = lum + (g - lum) * sat;
  b = lum + (b - lum) * sat;
  return [
    Math.min(1, Math.max(0, r)),
    Math.min(1, Math.max(0, g)),
    Math.min(1, Math.max(0, b)),
    1
  ];
}
`.trim()

export interface NdviRequestInput {
  geometry: GeoJSON.Polygon
  /** ISO date strings — defaults to last 90 days. */
  fromDate?: string
  toDate?: string
  width?: number
  height?: number
  maxCloudCoverage?: number
}

export interface NdviImageResult {
  pngBuffer: Buffer
  capturedOn: string | null
}

async function processSentinel2(
  evalscript: string,
  input: NdviRequestInput,
  windowDays: number,
): Promise<NdviImageResult> {
  if (!isSentinelHubConfigured()) {
    throw new Error('Sentinel Hub credentials not configured.')
  }

  const toDate = input.toDate ?? new Date().toISOString()
  const fromDate =
    input.fromDate ??
    new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  const token = await getAccessToken()

  const body = {
    input: {
      bounds: {
        geometry: input.geometry,
        properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' },
      },
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: { from: fromDate, to: toDate },
            maxCloudCoverage: input.maxCloudCoverage ?? 20,
          },
          mosaickingOrder: 'leastCC',
        },
      ],
    },
    output: {
      width: input.width ?? 800,
      height: input.height ?? 600,
      responses: [{ identifier: 'default', format: { type: 'image/png' } }],
    },
    evalscript,
  }

  const res = await fetch(PROCESS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'image/png',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sentinel Hub process failed: ${res.status} ${text.slice(0, 200)}`)
  }

  const capturedOn = res.headers.get('x-sh-data-applied-time') ?? null
  const pngBuffer = Buffer.from(await res.arrayBuffer())
  return { pngBuffer, capturedOn }
}

/**
 * Colored NDVI raster (vigor heatmap), mosaicking the least-cloudy Sentinel-2
 * capture in the last 90 days.
 */
export function fetchNdviImage(input: NdviRequestInput): Promise<NdviImageResult> {
  return processSentinel2(NDVI_EVALSCRIPT, input, 90)
}

/**
 * Natural-color (true RGB) snapshot of the field, mosaicking the least-cloudy
 * Sentinel-2 capture in the last 30 days. This is the "what does my field
 * actually look like right now" view — refreshed every few weeks. Window is
 * 30 days because Gulf Coast cloud cover routinely blocks 2-week windows.
 */
export function fetchLatestRgbImage(
  input: NdviRequestInput,
): Promise<NdviImageResult> {
  return processSentinel2(TRUE_COLOR_EVALSCRIPT, {
    ...input,
    maxCloudCoverage: input.maxCloudCoverage ?? 40,
  }, 30)
}
