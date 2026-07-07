// Placement math for a block's on-map labels (cut in the center, id / variety /
// acres in three corners). Kept pure and free of mapbox imports so it can be
// unit-verified against real angled geometry in plain Node.
//
// Why this exists: real cane blocks are angled parallelograms, not axis-aligned
// squares. Anchoring a corner label at a bounding-box corner drops it OUTSIDE
// the block — out in the road or on a neighbor (the bug growers reported). We
// instead anchor each corner label to one of the block's ACTUAL vertices,
// pulled toward the centroid so it always sits inside a convex block.

export type LngLat = [number, number]

export interface CornerLabelAnchors {
  center: LngLat // cut label
  id: LngLat // top-left corner
  variety: LngLat // top-right corner
  acres: LngLat // bottom-right corner
}

// `ring` is a GeoJSON Polygon outer ring (may or may not repeat the first point
// as the closing point). Returns null for degenerate rings.
export function cornerLabelAnchors(ring: LngLat[] | undefined): CornerLabelAnchors | null {
  if (!ring || ring.length < 4) return null
  const last = ring[ring.length - 1]
  const verts = last[0] === ring[0][0] && last[1] === ring[0][1] ? ring.slice(0, -1) : ring
  if (verts.length < 3) return null

  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  let cx = 0
  let cy = 0
  for (const [lng, lat] of verts) {
    if (lng < minLng) minLng = lng
    if (lat < minLat) minLat = lat
    if (lng > maxLng) maxLng = lng
    if (lat > maxLat) maxLat = lat
    cx += lng
    cy += lat
  }
  cx /= verts.length
  cy /= verts.length

  // Assign each corner label to the nearest vertex NOT already taken, so a
  // skewed / near-diamond block can't collapse two labels onto one vertex.
  const used = new Set<number>()
  const nearestUnused = (tx: number, ty: number): LngLat => {
    let bi = -1
    let bd = Infinity
    for (let i = 0; i < verts.length; i++) {
      if (used.has(i)) continue
      const d = (verts[i][0] - tx) ** 2 + (verts[i][1] - ty) ** 2
      if (d < bd) {
        bd = d
        bi = i
      }
    }
    used.add(bi)
    return verts[bi]
  }

  // Pull the anchor 32% of the way from the vertex toward the centroid. The
  // centroid→vertex segment is interior for a convex block, so the result is
  // guaranteed inside while still reading as a corner label.
  const inward = (v: LngLat, t = 0.68): LngLat => [cx + (v[0] - cx) * t, cy + (v[1] - cy) * t]

  return {
    center: [cx, cy],
    id: inward(nearestUnused(minLng, maxLat)), // top-left
    variety: inward(nearestUnused(maxLng, maxLat)), // top-right
    acres: inward(nearestUnused(maxLng, minLat)), // bottom-right
  }
}
