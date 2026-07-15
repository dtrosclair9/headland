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

// Pull the .shp/.dbf/.prj out of an upload — works whether the farmer sends a
// single .zip or the loose files (FarmWorks exports loose files, so we accept
// both). Throws a farmer-readable message if the required parts are missing.
export function extractShapefileComponents(
  files: { name: string; data: Buffer }[],
): ShpComponents {
  let entries = files
  const zipFile = files.find((f) => f.name.toLowerCase().endsWith('.zip'))
  if (zipFile) {
    const zip = new JSZip(zipFile.data)
    entries = Object.keys(zip.files)
      .filter((n) => !n.endsWith('/'))
      .map((n) => ({ name: n, data: zip.file(n).asNodeBuffer() as Buffer }))
  }
  const find = (ext: string) => entries.find((e) => e.name.toLowerCase().endsWith(ext))
  const shp = find('.shp')
  const dbf = find('.dbf')
  const prj = find('.prj')
  if (!shp || !dbf) {
    throw new Error(
      'Missing shapefile parts. Upload the .shp and .dbf together (and .prj if you have it), or a .zip containing them.',
    )
  }
  return { shp: shp.data, dbf: dbf.data, prj: prj ? prj.data.toString('utf8') : null }
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

  const columns = features.length ? Object.keys(features[0].properties) : []
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
