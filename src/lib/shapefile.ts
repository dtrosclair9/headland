// Minimal, correct Esri shapefile writer for 2D polygons.
//
// Replaces shp-write 0.3.2, which collapsed every feature into a single .shp
// shape while still writing one .dbf record per feature — producing the ArcMap
// error "Number of shapes does not match the number of table records."
//
// Outputs the three core components (.shp, .shx, .dbf). The caller adds .prj
// (NAD83) and .cpg (UTF-8) and zips them together.

export type ShpField =
  | { name: string; type: 'C'; length: number }
  | { name: string; type: 'N'; length: number; decimals: number }

export interface ShpFeature {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  // Values aligned positionally to the `fields` array.
  values: Array<string | number | null>
}

type Ring = number[][] // array of [x, y]

// Signed area via the shoelace formula. > 0 = counter-clockwise, < 0 = clockwise.
function signedArea(ring: Ring): number {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

function ensureClosed(ring: Ring): Ring {
  if (ring.length === 0) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) return [...ring, first]
  return ring
}

// Shapefile polygons require outer rings clockwise, holes counter-clockwise —
// the opposite of GeoJSON's convention. Orient each ring explicitly so the file
// is correct regardless of how the source data was wound.
function orient(ring: Ring, wantClockwise: boolean): Ring {
  const closed = ensureClosed(ring)
  const isClockwise = signedArea(closed) < 0
  return isClockwise === wantClockwise ? closed : [...closed].reverse()
}

// Flatten a feature's geometry into shapefile "parts" (rings), correctly wound.
function ringsFor(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): Ring[] {
  const polys: GeoJSON.Position[][][] =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const rings: Ring[] = []
  for (const poly of polys) {
    poly.forEach((ring, i) => {
      // First ring of each polygon is the outer boundary (clockwise); rest are holes.
      rings.push(orient(ring as Ring, i === 0))
    })
  }
  return rings
}

function boundsOf(rings: Ring[]): [number, number, number, number] {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < xmin) xmin = x
      if (y < ymin) ymin = y
      if (x > xmax) xmax = x
      if (y > ymax) ymax = y
    }
  }
  return [xmin, ymin, xmax, ymax]
}

const SHAPE_TYPE_POLYGON = 5
const HEADER_BYTES = 100

// One .shp record's content (without the 8-byte record header).
function polygonRecordContent(rings: Ring[]): Buffer {
  const numParts = rings.length
  const numPoints = rings.reduce((n, r) => n + r.length, 0)
  const [xmin, ymin, xmax, ymax] = boundsOf(rings)

  const size = 4 + 32 + 4 + 4 + 4 * numParts + 16 * numPoints
  const buf = Buffer.alloc(size)
  let o = 0
  buf.writeInt32LE(SHAPE_TYPE_POLYGON, o); o += 4
  buf.writeDoubleLE(xmin, o); o += 8
  buf.writeDoubleLE(ymin, o); o += 8
  buf.writeDoubleLE(xmax, o); o += 8
  buf.writeDoubleLE(ymax, o); o += 8
  buf.writeInt32LE(numParts, o); o += 4
  buf.writeInt32LE(numPoints, o); o += 4
  let pointIndex = 0
  for (const ring of rings) {
    buf.writeInt32LE(pointIndex, o); o += 4
    pointIndex += ring.length
  }
  for (const ring of rings) {
    for (const [x, y] of ring) {
      buf.writeDoubleLE(x, o); o += 8
      buf.writeDoubleLE(y, o); o += 8
    }
  }
  return buf
}

function writeMainHeader(
  buf: Buffer,
  fileLengthBytes: number,
  bbox: [number, number, number, number],
): void {
  buf.writeInt32BE(9994, 0) // file code
  buf.writeInt32BE(fileLengthBytes / 2, 24) // length in 16-bit words
  buf.writeInt32LE(1000, 28) // version
  buf.writeInt32LE(SHAPE_TYPE_POLYGON, 32)
  buf.writeDoubleLE(bbox[0], 36)
  buf.writeDoubleLE(bbox[1], 44)
  buf.writeDoubleLE(bbox[2], 52)
  buf.writeDoubleLE(bbox[3], 60)
  // Z and M ranges left as 0 (2D).
}

// Truncate a UTF-8 string to at most `maxBytes` without splitting a character.
function utf8Slice(str: string, maxBytes: number): Buffer {
  const full = Buffer.from(str, 'utf8')
  if (full.length <= maxBytes) return full
  let end = maxBytes
  // Back off if we'd cut a multi-byte sequence mid-character.
  while (end > 0 && (full[end] & 0xc0) === 0x80) end--
  return full.subarray(0, end)
}

export function buildShapefile(
  fields: ShpField[],
  features: ShpFeature[],
): { shp: Buffer; shx: Buffer; dbf: Buffer } {
  // ── .shp + .shx ──────────────────────────────────────────────────
  const recordBodies = features.map((f) => polygonRecordContent(ringsFor(f.geometry)))

  let shpLen = HEADER_BYTES
  let shxLen = HEADER_BYTES
  const shxEntries: Array<{ offsetWords: number; lenWords: number }> = []
  for (const body of recordBodies) {
    const lenWords = body.length / 2
    shxEntries.push({ offsetWords: shpLen / 2, lenWords })
    shpLen += 8 + body.length // 8-byte record header + content
    shxLen += 8
  }

  const allRings = features.flatMap((f) => ringsFor(f.geometry))
  const overallBbox = boundsOf(allRings.length ? allRings : [[[0, 0]]])

  const shp = Buffer.alloc(shpLen)
  writeMainHeader(shp, shpLen, overallBbox)
  let so = HEADER_BYTES
  recordBodies.forEach((body, i) => {
    shp.writeInt32BE(i + 1, so) // record number, 1-based
    shp.writeInt32BE(body.length / 2, so + 4) // content length in words
    body.copy(shp, so + 8)
    so += 8 + body.length
  })

  const shx = Buffer.alloc(shxLen)
  writeMainHeader(shx, shxLen, overallBbox)
  let xo = HEADER_BYTES
  for (const e of shxEntries) {
    shx.writeInt32BE(e.offsetWords, xo)
    shx.writeInt32BE(e.lenWords, xo + 4)
    xo += 8
  }

  // ── .dbf (dBASE III) ─────────────────────────────────────────────
  const recordLength = 1 + fields.reduce((n, f) => n + f.length, 0) // 1 = deletion flag
  const headerLength = 32 + 32 * fields.length + 1
  const dbf = Buffer.alloc(headerLength + features.length * recordLength + 1)

  dbf.writeUInt8(0x03, 0) // dBASE III
  const now = new Date()
  dbf.writeUInt8(now.getFullYear() - 1900, 1)
  dbf.writeUInt8(now.getMonth() + 1, 2)
  dbf.writeUInt8(now.getDate(), 3)
  dbf.writeUInt32LE(features.length, 4)
  dbf.writeUInt16LE(headerLength, 8)
  dbf.writeUInt16LE(recordLength, 10)

  fields.forEach((f, i) => {
    const off = 32 + i * 32
    const nameBytes = utf8Slice(f.name, 10)
    nameBytes.copy(dbf, off) // remaining name bytes already 0 (null-terminated)
    dbf.write(f.type, off + 11, 'ascii')
    dbf.writeUInt8(f.length, off + 16)
    dbf.writeUInt8(f.type === 'N' ? f.decimals : 0, off + 17)
  })
  dbf.writeUInt8(0x0d, 32 + fields.length * 32) // header terminator

  let ro = headerLength
  for (const feat of features) {
    dbf.writeUInt8(0x20, ro) // not deleted
    let fo = ro + 1
    fields.forEach((f, i) => {
      const raw = feat.values[i]
      const cell = Buffer.alloc(f.length, 0x20) // space-filled
      if (raw !== null && raw !== undefined && raw !== '') {
        if (f.type === 'N') {
          const num = typeof raw === 'number' ? raw : Number(raw)
          const text = Number.isFinite(num) ? num.toFixed(f.decimals) : ''
          // Numeric fields are right-justified.
          Buffer.from(text.slice(-f.length), 'ascii').copy(cell, Math.max(0, f.length - text.length))
        } else {
          // Character fields are left-justified.
          utf8Slice(String(raw), f.length).copy(cell, 0)
        }
      }
      cell.copy(dbf, fo)
      fo += f.length
    })
    ro += recordLength
  }
  dbf.writeUInt8(0x1a, dbf.length - 1) // EOF marker

  return { shp, shx, dbf }
}
