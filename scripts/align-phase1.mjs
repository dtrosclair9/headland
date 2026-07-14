/*
 * PHASE 1 — rigid best-fit alignment (Rosedale). For each block, slide+rotate
 * (shape & acreage preserved) so its whole outline lands on the real field
 * boundaries in the satellite. Uses chamfer matching against a clean edge map
 * (strong lines only; bright rooftops masked as keep-outs). Proposes a move
 * only when it's a confident improvement. Renders old-vs-proposed for review.
 * READ-ONLY. Run: node --env-file=.env.local scripts/align-phase1.mjs
 */
import postgres from 'postgres'
import sharp from 'sharp'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', prepare: false, max: 1 })

const org = (await sql`select id from organizations where name ilike '%trosclair%'`)[0]
const pl = (await sql`select id from plantations where org_id=${org.id} and name='Rosedale'`)[0]
const rows = await sql`select name, st_asgeojson(geometry)::json as g from fields where plantation_id=${pl.id}`
await sql.end()
const blocks = rows.map((r) => ({ name: r.name, rings: r.g.coordinates }))

let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
for (const b of blocks) for (const ring of b.rings) for (const [lng, lat] of ring) {
  if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng
  if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat
}
const padLng = (maxLng - minLng) * 0.08, padLat = (maxLat - minLat) * 0.08
minLng -= padLng; maxLng += padLng; minLat -= padLat; maxLat += padLat
const spanLng = maxLng - minLng, spanLat = maxLat - minLat
const midLat = (minLat + maxLat) / 2
const wM = spanLng * 111320 * Math.cos((midLat * Math.PI) / 180), hM = spanLat * 111320
const aspect = wM / hM
let W = 1280, H = Math.round(W / aspect); if (H > 1280) { H = 1280; W = Math.round(H * aspect) }

const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/[${minLng},${minLat},${maxLng},${maxLat}]/${W}x${H}@2x?access_token=${TOKEN}&attribution=false&logo=false`
const satBuf = Buffer.from(await (await fetch(url)).arrayBuffer())
const { data, info } = await sharp(satBuf).raw().toBuffer({ resolveWithObject: true })
const iw = info.width, ih = info.height, ch = info.channels, N = iw * ih
console.log(`Rosedale ${blocks.length} blocks · satellite ${iw}x${ih}`)

// ── Clean boundary map ─────────────────────────────────────────────────────
const luma = new Float32Array(N)
for (let i = 0; i < N; i++) luma[i] = 0.299 * data[i*ch] + 0.587 * data[i*ch+1] + 0.114 * data[i*ch+2]
// Sobel magnitude
const mag = new Float32Array(N)
const at = (x, y) => luma[y * iw + x]
const vals = []
for (let y = 1; y < ih - 1; y++) for (let x = 1; x < iw - 1; x++) {
  const gx = -at(x-1,y-1)-2*at(x-1,y)-at(x-1,y+1)+at(x+1,y-1)+2*at(x+1,y)+at(x+1,y+1)
  const gy = -at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1)+at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1)
  const m = Math.hypot(gx, gy)
  mag[y * iw + x] = m
  vals.push(m)
}
// Keep only the strongest ~8% of edges (drops cane-row texture, keeps real
// boundaries: ditches, roads, headlands, tree lines, field-colour edges).
vals.sort((a, b) => a - b)
const thresh = vals[Math.floor(vals.length * 0.92)]
// Bright rooftops/sheds = keep-outs: never a snap target.
const bin = new Uint8Array(N)
for (let i = 0; i < N; i++) if (mag[i] >= thresh && luma[i] < 205) bin[i] = 1

// ── Chamfer distance transform (2-pass) ────────────────────────────────────
const BIG = 1e6
const D = new Float32Array(N)
for (let i = 0; i < N; i++) D[i] = bin[i] ? 0 : BIG
const O = 1, DG = 1.4142
for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
  const i = y * iw + x; let d = D[i]
  if (x > 0) d = Math.min(d, D[i-1] + O)
  if (y > 0) d = Math.min(d, D[i-iw] + O)
  if (x > 0 && y > 0) d = Math.min(d, D[i-iw-1] + DG)
  if (x < iw-1 && y > 0) d = Math.min(d, D[i-iw+1] + DG)
  D[i] = d
}
for (let y = ih-1; y >= 0; y--) for (let x = iw-1; x >= 0; x--) {
  const i = y * iw + x; let d = D[i]
  if (x < iw-1) d = Math.min(d, D[i+1] + O)
  if (y < ih-1) d = Math.min(d, D[i+iw] + O)
  if (x < iw-1 && y < ih-1) d = Math.min(d, D[i+iw+1] + DG)
  if (x > 0 && y < ih-1) d = Math.min(d, D[i+iw-1] + DG)
  D[i] = d
}
const sampleD = (x, y) => {
  const xi = x < 0 ? 0 : x > iw-1 ? iw-1 : Math.round(x)
  const yi = y < 0 ? 0 : y > ih-1 ? ih-1 : Math.round(y)
  return D[yi * iw + xi]
}

// projection lng/lat <-> pixel
const px = (lng) => ((lng - minLng) / spanLng) * iw
const py = (lat) => ((maxLat - lat) / spanLat) * ih
const toLng = (x) => minLng + (x / iw) * spanLng
const toLat = (y) => maxLat - (y / ih) * spanLat

// ── Per-block rigid best-fit (translate + rotate, coarse→fine chamfer) ─────
function fit(block) {
  // sample points along every edge (~every 5px), + block pixel centroid
  const pts = []
  let cx = 0, cy = 0, nv = 0
  for (const ring of block.rings) {
    for (let k = 0; k < ring.length - 1; k++) {
      const [ax, ay] = [px(ring[k][0]), py(ring[k][1])]
      const [bx, by] = [px(ring[k+1][0]), py(ring[k+1][1])]
      cx += ax; cy += ay; nv++
      const len = Math.hypot(bx-ax, by-ay), steps = Math.max(1, Math.round(len / 5))
      for (let s = 0; s < steps; s++) { const t = s/steps; pts.push([ax+(bx-ax)*t, ay+(by-ay)*t]) }
    }
  }
  cx /= nv; cy /= nv
  const cost = (dx, dy, deg) => {
    const r = (deg*Math.PI)/180, c = Math.cos(r), s = Math.sin(r)
    let sum = 0
    for (const [x, y] of pts) {
      const rx = cx + (x-cx)*c - (y-cy)*s + dx
      const ry = cy + (x-cx)*s + (y-cy)*c + dy
      sum += sampleD(rx, ry)
    }
    return sum / pts.length
  }
  const base = cost(0, 0, 0)
  let best = { dx: 0, dy: 0, deg: 0, c: base }
  // coarse
  for (let dx = -28; dx <= 28; dx += 4) for (let dy = -28; dy <= 28; dy += 4)
    for (let deg = -4; deg <= 4; deg += 2) {
      const c = cost(dx, dy, deg); if (c < best.c) best = { dx, dy, deg, c }
    }
  // fine
  const b0 = best
  for (let dx = b0.dx-3; dx <= b0.dx+3; dx++) for (let dy = b0.dy-3; dy <= b0.dy+3; dy++)
    for (let deg = b0.deg-1.5; deg <= b0.deg+1.5; deg += 0.5) {
      const c = cost(dx, dy, deg); if (c < best.c) best = { dx, dy, deg, c }
    }
  return { base, best, cx, cy }
}

const proposals = []
let improved = 0
for (const block of blocks) {
  const { base, best, cx, cy } = fit(block)
  // Only propose when meaningfully better AND we started off the boundary.
  const confident = base > 2.5 && best.c < base * 0.6
  const r = (best.deg*Math.PI)/180, c = Math.cos(r), s = Math.sin(r)
  const newRings = block.rings.map((ring) => ring.map(([lng, lat]) => {
    const x = px(lng), y = py(lat)
    const rx = cx + (x-cx)*c - (y-cy)*s + best.dx
    const ry = cy + (x-cx)*s + (y-cy)*c + best.dy
    return [toLng(rx), toLat(ry)]
  }))
  if (confident) improved++
  proposals.push({ name: block.name, orig: block.rings, prop: confident ? newRings : block.rings, confident, base, cost: best.c, shift: Math.hypot(best.dx, best.dy), deg: best.deg })
}
console.log(`proposed moves: ${improved}/${blocks.length} blocks`)
const moved = proposals.filter(p => p.confident).map(p => `${p.name}(${p.shift.toFixed(0)}px ${p.deg.toFixed(1)}°)`)
console.log('moved:', moved.slice(0, 20).join(' '), moved.length > 20 ? `+${moved.length-20} more` : '')

// ── Render: old (dim red) vs proposed (bright green) over satellite ────────
const poly = (rings, stroke, w) => rings.map((ring) =>
  `<polyline points="${ring.map(([lng, lat]) => `${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${w}"/>`).join('')
const svg = (kind) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}">` +
  proposals.map(p =>
    kind === 'both'
      ? poly(p.orig, '#FF3B30', 2) + (p.confident ? poly(p.prop, '#00E676', 3) : '')
      : poly(p.prop, '#00E676', 3)
  ).join('') + `</svg>`)

// boundary map for reference
const edgePng = await sharp(Buffer.from(bin.map(v => v ? 255 : 0)), { raw: { width: iw, height: ih, channels: 1 } }).png().toBuffer()
await sharp(satBuf).png().composite([{ input: svg('both') }]).toFile('.ui-check/p1-oldvsnew.png')
await sharp(edgePng).composite([{ input: svg('both') }]).png().toFile('.ui-check/p1-boundarymap.png')
await sharp(satBuf).png().composite([{ input: svg('prop') }]).toFile('.ui-check/p1-proposed.png')
console.log('done — .ui-check/p1-*.png')
