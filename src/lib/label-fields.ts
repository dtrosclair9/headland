// Which block facts show on the map + plat sheets. Shared farm default lives on
// organizations.label_fields; a ?labels= query overrides per print, and the live
// map keeps a per-device override (see resolveMapView below).
export type LabelField = 'name' | 'variety' | 'cut' | 'acres'
export const ALL_LABEL_FIELDS: LabelField[] = ['name', 'variety', 'cut', 'acres']

export const LABEL_FIELD_NAMES: Record<LabelField, string> = {
  name: 'Block ID',
  variety: 'Variety',
  cut: 'Cycle',
  acres: 'Acres',
}

// Parse a ?labels= param or a stored preset into a field set. Unknown values
// are dropped; empty/absent input falls back to the provided default.
export function parseLabelFields(
  raw: string | string[] | null | undefined,
  fallback: LabelField[] = ALL_LABEL_FIELDS,
): LabelField[] {
  const items = (Array.isArray(raw) ? raw : (raw ?? '').split(','))
    .map((s) => s.trim())
    .filter((s): s is LabelField => (ALL_LABEL_FIELDS as string[]).includes(s))
  return items.length > 0 ? items : fallback
}

export type MapView = { labelFields: LabelField[]; colorBy: 'stage' | 'variety' }
export type ViewDefaults = MapView & { updatedAt: string }

// Per-device sticky live-map view. See parseLabelFields for the SERVER default;
// this resolver is for the CLIENT override, which — unlike the default — honors
// an explicit empty array as "show no labels".
export const MAP_VIEW_KEY = 'headland-map-view'

// A local override is honored only while it was based on the CURRENT org default
// (basedOn === def.updatedAt). Once a newer default is saved anywhere, the
// timestamp bumps, the stored basedOn no longer matches, and the fresh default
// wins on the next load — how a saved default propagates across a user's devices.
export function resolveMapView(localRaw: string | null, def: ViewDefaults): MapView {
  if (localRaw) {
    try {
      const p = JSON.parse(localRaw) as {
        labelFields?: unknown
        colorBy?: unknown
        basedOn?: unknown
      }
      if (p && p.basedOn === def.updatedAt) {
        const labelFields = (Array.isArray(p.labelFields) ? p.labelFields : []).filter(
          (s): s is LabelField => (ALL_LABEL_FIELDS as string[]).includes(s as string),
        )
        const colorBy = p.colorBy === 'variety' ? 'variety' : 'stage'
        return { labelFields, colorBy }
      }
    } catch {
      /* malformed — fall through to the default */
    }
  }
  return { labelFields: def.labelFields, colorBy: def.colorBy }
}
