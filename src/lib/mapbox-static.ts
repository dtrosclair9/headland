// Build a Mapbox Static Images API URL with a polygon overlay for PDF prints.
// Docs: https://docs.mapbox.com/api/maps/static-images/

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

export function buildStaticMapUrl(
  geometry: GeoJSON.Polygon,
  width: number,
  height: number,
): string | null {
  if (!MAPBOX_TOKEN) return null

  const overlay = encodeURIComponent(
    JSON.stringify({
      type: 'Feature',
      properties: {
        stroke: '#E8A33D',
        'stroke-width': 3,
        fill: '#E8A33D',
        'fill-opacity': 0.18,
      },
      geometry,
    }),
  )

  // auto fits the overlay; @2x for retina-quality print rendering.
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `geojson(${overlay})/` +
    `auto/${width}x${height}@2x` +
    `?access_token=${MAPBOX_TOKEN}&padding=40`
  )
}

export async function fetchStaticMapImage(
  geometry: GeoJSON.Polygon,
  width: number,
  height: number,
): Promise<Buffer | null> {
  const url = buildStaticMapUrl(geometry, width, height)
  if (!url) return null
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}
