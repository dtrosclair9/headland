/*
 * PHASE 0 — satellite block-alignment feasibility spike (Rosedale only).
 * Fetches georeferenced Mapbox satellite for the plantation, extracts three
 * boundary signals (edge strength, darkness=ditches, greenness=headlands),
 * and overlays the current blocks on each so we can judge: do the real field
 * boundaries pop out cleanly, or does cane-row texture drown them?
 * READ-ONLY — touches no data. Run: node --env-file=.env.local scripts/align-spike.mjs
 */
import postgres from 'postgres'
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', prepare: false, max: 1 })

// ── 1. Rosedale blocks + padded bbox ──────────────────────────────────────
const org = (await sql`select id from organizations where name ilike '%trosclair%'`)[0]
const pl = (await sql`select id from plantations where org_id=${org.id} and name='Rosedale'`)[0]
const rows = await sql`
  select name, st_asgeojson(geometry)::json as g from fields where plantation_id=${pl.id}`
await sql.end()
const blocks = rows.map((r) => ({ name: r.name, rings: r.g.coordinates }))

let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
for (const b of blocks)
  for (const ring of b.rings)
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
const padLng = (maxLng - minLng) * 0.08, padLat = (maxLat - minLat) * 0.08
minLng -= padLng; maxLng += padLng; minLat -= padLat; maxLat += padLat
const spanLng = maxLng - minLng, spanLat = maxLat - minLat
const midLat = (minLat + maxLat) / 2

// ── 2. Image dims matched to the bbox aspect (no Mapbox padding) ───────────
const wM = spanLng * 111320 * Math.cos((midLat * Math.PI) / 180)
const hM = spanLat * 111320
const aspect = wM / hM
let W = 1280, H = Math.round(W / aspect)
if (H > 1280) { H = 1280; W = Math.round(H * aspect) }
console.log(`Rosedale: ${blocks.length} blocks, ~${Math.round(wM)}x${Math.round(hM)}m, image ${W}x${H}@2x`)

// ── 3. Fetch georeferenced satellite ──────────────────────────────────────
const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/[${minLng},${minLat},${maxLng},${maxLat}]/${W}x${H}@2x?access_token=${TOKEN}&attribution=false&logo=false`
const res = await fetch(url)
if (!res.ok) { console.error('mapbox', res.status, await res.text()); process.exit(1) }
const satBuf = Buffer.from(await res.arrayBuffer())
const { data, info } = await sharp(satBuf).raw().toBuffer({ resolveWithObject: true })
const iw = info.width, ih = info.height, ch = info.channels
console.log(`satellite ${iw}x${ih}x${ch}`)

// pixel → the three signals + luma
const N = iw * ih
const luma = new Float32Array(N)
const dark = new Uint8ClampedArray(N)   // ditch signal: how dark
const green = new Uint8ClampedArray(N)  // headland signal: grass greenness
for (let i = 0; i < N; i++) {
  const r = data[i * ch], g = data[i * ch + 1], b = data[i * ch + 2]
  const y = 0.299 * r + 0.587 * g + 0.114 * b
  luma[i] = y
  dark[i] = Math.max(0, 255 - y * 1.6)            // emphasize the darkest pixels
  green[i] = Math.max(0, Math.min(255, (2 * g - r - b) * 1.4)) // grass pops vs reddish cane
}

// ── 4. Sobel edge magnitude on luma ───────────────────────────────────────
const edge = new Uint8ClampedArray(N)
const at = (x, y) => luma[y * iw + x]
let emax = 1
const raw = new Float32Array(N)
for (let y = 1; y < ih - 1; y++)
  for (let x = 1; x < iw - 1; x++) {
    const gx = -at(x-1,y-1)-2*at(x-1,y)-at(x-1,y+1)+at(x+1,y-1)+2*at(x+1,y)+at(x+1,y+1)
    const gy = -at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1)+at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1)
    const m = Math.hypot(gx, gy)
    raw[y * iw + x] = m
    if (m > emax) emax = m
  }
for (let i = 0; i < N; i++) edge[i] = (raw[i] / emax) * 255

// grayscale raw buffer → PNG helper
const toPng = (buf) => sharp(Buffer.from(buf), { raw: { width: iw, height: ih, channels: 1 } }).png().toBuffer()

// ── 5. Block overlay as an SVG (projected via linear bbox mapping) ─────────
const px = (lng) => ((lng - minLng) / spanLng) * iw
const py = (lat) => ((maxLat - lat) / spanLat) * ih
const polys = blocks
  .map((b) =>
    b.rings
      .map((ring) => {
        const pts = ring.map(([lng, lat]) => `${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join(' ')
        return `<polyline points="${pts}" fill="none" stroke="#00E5FF" stroke-width="3"/>`
      })
      .join(''),
  )
  .join('')
const overlay = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}">${polys}</svg>`,
)

async function compose(basePng, name) {
  await sharp(basePng).composite([{ input: overlay }]).png().toFile(`.ui-check/${name}`)
}

// ── 6. Emit: clean satellite + each signal, each with blocks overlaid ──────
await sharp(satBuf).png().toFile('.ui-check/spike-0-satellite.png')
await compose(await sharp(satBuf).png().toBuffer(), 'spike-1-sat-blocks.png')
await compose(await toPng(edge), 'spike-2-edges.png')
await compose(await toPng(dark), 'spike-3-ditches.png')
await compose(await toPng(green), 'spike-4-headlands.png')
console.log('done — see .ui-check/spike-*.png')
