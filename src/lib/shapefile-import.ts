// @ts-expect-error - shapefile ships no types
import * as shapefile from 'shapefile'
// @ts-expect-error - jszip 2.x ships no types
import JSZip from 'jszip'
import proj4 from 'proj4'

export interface ShpComponents {
  shp: Buffer
  dbf: Buffer
  prj: string | null
}

// What an upload turned out to be: an Esri shapefile set, or a GeoJSON file
// (FarmMind and most web tools export GeoJSON).
export type ImportSource =
  | ({ kind: 'shapefile' } & ShpComponents)
  | { kind: 'geojson'; data: Buffer }

// Identify + pull the boundary file(s) out of an upload — a single .zip, loose
// shapefile parts (FarmWorks exports loose files), or a .geojson/.json.
// Throws a farmer-readable message if nothing usable is there.
export function extractImportSource(files: { name: string; data: Buffer }[]): ImportSource {
  let entries = files
  const zipFile = files.find((f) => f.name.toLowerCase().endsWith('.zip'))
  if (zipFile) {
    const zip = new JSZip(zipFile.data)
    entries = Object.keys(zip.files)
      .filter((n) => !n.endsWith('/'))
      .map((n) => ({ name: n, data: zip.file(n).asNodeBuffer() as Buffer }))
  }
  const find = (...exts: string[]) =>
    entries.find((e) => exts.some((ext) => e.name.toLowerCase().endsWith(ext)))
  const shp = find('.shp')
  const dbf = find('.dbf')
  if (shp && dbf) {
    const prj = find('.prj')
    return {
      kind: 'shapefile',
      shp: shp.data,
      dbf: dbf.data,
      prj: prj ? prj.data.toString('utf8') : null,
    }
  }
  const geojson = find('.geojson', '.json')
  if (geojson) return { kind: 'geojson', data: geojson.data }
  throw new Error(
    'Missing boundary files. Upload a shapefile (.shp and .dbf together, or a .zip of them) or a .geojson file.',
  )
}

// Back-compat name used by the import routes prior to GeoJSON support.
export function extractShapefileComponents(
  files: { name: string; data: Buffer }[],
): ShpComponents {
  const src = extractImportSource(files)
  if (src.kind !== 'shapefile') {
    throw new Error('Upload the .shp and .dbf together, or a .zip containing them.')
  }
  return { shp: src.shp, dbf: src.dbf, prj: src.prj }
}

export interface ImportFeature {
  geometry: GeoJSON.Polygon
  properties: Record<string, string>
}

export interface ParsedShapefile {
  count: number
  columns: string[]
  // First non-empty sample value per column (for the mapping UI).
  samples: Record<string, string>
  // Distinct values per column, capped — used by the cut/ratoon value-map.
  // Columns with too many distinct values are returned empty (not a cut column).
  distinct: Record<string, string[]>
  features: ImportFeature[]
  projected: boolean
}

const DISTINCT_CAP = 50

function toArrayBuffer(b: Buffer): ArrayBuffer {
  // Fresh, exact-length copy — typed as ArrayBuffer (not ArrayBufferLike).
  return new Uint8Array(b).buffer
}

// Build a converter from the shapefile's own CRS (the ESRI .prj / WKT) to
// WGS84 lng/lat. FSA CLU exports are almost always in a projected CRS (UTM
// meters, State Plane, etc.), which Mapbox/GeoJSON can't use — so we normalize
// to WGS84 at the import boundary instead of rejecting the file. Returns null
// if proj4 can't parse the .prj, so the caller can fall back to rejecting
// rather than importing garbage coordinates.
function buildReprojector(
  prj?: string | null,
): ((x: number, y: number) => [number, number]) | null {
  if (!prj || !/PROJCS/i.test(prj)) return null
  try {
    const conv = proj4(prj, 'WGS84')
    const test = conv.forward([0, 0])
    if (!Number.isFinite(test[0]) || !Number.isFinite(test[1])) return null
    return (x, y) => {
      const r = conv.forward([x, y])
      return [r[0], r[1]]
    }
  } catch {
    return null
  }
}

function inWgs84Range(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  )
}

// Parse the raw shapefile components into features + a column summary.
// Geometry is normalized to Polygons (MultiPolygons split into parts, each part
// carrying the same attributes) since the fields.geometry column is POLYGON.
export async function parseShapefileBuffers(input: {
  shp: Buffer
  dbf: Buffer
  prj?: string | null
}): Promise<ParsedShapefile> {
  const isProjected = !!input.prj && /PROJCS/i.test(input.prj)
  // FSA/USDA shapefiles are usually in a projected CRS (UTM meters). Reproject
  // to WGS84 lng/lat here rather than rejecting the file. If we can't parse the
  // .prj, reproj stays null and we leave `projected` true so the route rejects
  // rather than importing meters-as-degrees.
  const reproj = isProjected ? buildReprojector(input.prj) : null
  const reprojectPolygon = (coords: number[][][]): number[][][] =>
    reproj
      ? coords.map((ring) => ring.map(([x, y]) => reproj(x, y)))
      : coords

  const fc = await shapefile.read(toArrayBuffer(input.shp), toArrayBuffer(input.dbf))

  const features: ImportFeature[] = []
  for (const f of (fc.features ?? []) as GeoJSON.Feature[]) {
    if (!f.geometry) continue
    const props: Record<string, string> = {}
    for (const [k, v] of Object.entries(f.properties ?? {})) {
      props[k] = v === null || v === undefined ? '' : String(v).trim()
    }
    if (f.geometry.type === 'Polygon') {
      const coordinates = reprojectPolygon((f.geometry as GeoJSON.Polygon).coordinates)
      features.push({ geometry: { type: 'Polygon', coordinates }, properties: props })
    } else if (f.geometry.type === 'MultiPolygon') {
      for (const poly of (f.geometry as GeoJSON.MultiPolygon).coordinates) {
        const coordinates = reprojectPolygon(poly)
        features.push({ geometry: { type: 'Polygon', coordinates }, properties: props })
      }
    }
    // Non-polygon geometries are skipped (this importer is field boundaries).
  }

  // A file is only "still projected" (and thus rejected downstream) if it was
  // projected AND we couldn't reproject it — either the .prj wouldn't parse, or
  // the result isn't valid lng/lat. A successfully reprojected file is geographic.
  const firstPt = features[0]?.geometry.coordinates?.[0]?.[0]
  const reprojectFailed =
    isProjected && (!reproj || (firstPt ? !inWgs84Range(firstPt[0], firstPt[1]) : false))
  const projected = reprojectFailed

  return summarize(features, projected)
}

// Column summary (names, first samples, distinct values) shared by every
// import format.
function summarize(features: ImportFeature[], projected: boolean): ParsedShapefile {
  // Union of keys across features — GeoJSON rows can have ragged properties.
  const colSet = new Set<string>()
  for (const f of features) for (const k of Object.keys(f.properties)) colSet.add(k)
  const columns = [...colSet]
  const samples: Record<string, string> = {}
  const sets: Record<string, Set<string>> = {}
  for (const col of columns) sets[col] = new Set()

  for (const feat of features) {
    for (const col of columns) {
      const val = feat.properties[col] ?? ''
      if (!samples[col] && val) samples[col] = val
      const s = sets[col]
      if (s.size <= DISTINCT_CAP && val) s.add(val)
    }
  }

  const distinct: Record<string, string[]> = {}
  for (const col of columns) {
    const arr = [...sets[col]]
    distinct[col] = arr.length <= DISTINCT_CAP ? arr.sort() : []
  }

  return { count: features.length, columns, samples, distinct, features, projected }
}

// Parse a GeoJSON FeatureCollection (FarmMind and most web tools export
// this). GeoJSON is WGS84 lng/lat by spec — but guard against projected
// coordinates sneaking in so the route rejects them instead of importing
// meters-as-degrees. Nested object properties (FarmMind's _fm blobs) are
// dropped; scalars are stringified like dbf values.
export function parseGeoJSONBuffer(buf: Buffer): ParsedShapefile {
  let fc: GeoJSON.FeatureCollection
  try {
    fc = JSON.parse(buf.toString('utf8')) as GeoJSON.FeatureCollection
  } catch {
    throw new Error('That .geojson file could not be read — it is not valid GeoJSON.')
  }

  const features: ImportFeature[] = []
  for (const f of fc.features ?? []) {
    if (!f?.geometry) continue
    const props: Record<string, string> = {}
    for (const [k, v] of Object.entries(f.properties ?? {})) {
      if (v === null || v === undefined) props[k] = ''
      else if (typeof v === 'object') continue
      else props[k] = String(v).trim()
    }
    if (f.geometry.type === 'Polygon') {
      features.push({ geometry: f.geometry as GeoJSON.Polygon, properties: props })
    } else if (f.geometry.type === 'MultiPolygon') {
      for (const poly of (f.geometry as GeoJSON.MultiPolygon).coordinates) {
        features.push({ geometry: { type: 'Polygon', coordinates: poly }, properties: props })
      }
    }
  }

  const first = features[0]?.geometry.coordinates?.[0]?.[0]
  const projected = first ? !inWgs84Range(first[0], first[1]) : false
  return summarize(features, projected)
}

// Parse any accepted upload into the common shape.
export async function parseImportSource(src: ImportSource): Promise<ParsedShapefile> {
  if (src.kind === 'geojson') return parseGeoJSONBuffer(src.data)
  return parseShapefileBuffers(src)
}
