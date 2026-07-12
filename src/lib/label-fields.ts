// Which block facts print on plat sheets. Farm default lives on
// organizations.print_label_fields; a ?labels= query overrides per print.
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
