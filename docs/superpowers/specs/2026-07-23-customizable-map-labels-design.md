# Customizable Map Labels + Color-By Defaults — Design

**Date:** 2026-07-23
**Status:** Approved design, pending spec review

## Summary

Make the four on-map block labels (Block ID, Variety, Cycle, Acres) **and** the
color-by mode (crop stage vs variety) customizable on the **live map**, matching
the toggles that already exist on the print page. The live choice is
**per-device sticky**; a **shared, cross-device default** is editable both from
the map (one "Save as default" pill) and from Settings. Print continues to read
the same shared label default.

## Current state (grounded)

- `src/lib/label-fields.ts` — the 4 fields: `name`→Block ID, `variety`→Variety,
  `cut`→Cycle, `acres`→Acres. `LABEL_FIELD_NAMES`, `ALL_LABEL_FIELDS`,
  `parseLabelFields(raw, fallback)`.
- **Print** already reads org default `organizations.print_label_fields`
  (`text[] not null default '{name,variety,cut,acres}'`, migration `0030`) plus a
  `?labels=` per-print override; `SaveDefaultsButton.tsx` → `POST /api/print-prefs`
  writes it (Zod `fields.min(1).max(4)`). Seven print pages read it.
- **Live map** (`src/components/map/FieldMap.tsx`) draws all four labels
  **always** via four Mapbox layers — `fields-label` (center = cut), and corner
  layers `field-label-id`, `field-label-variety`, `field-label-acres`. Placement
  in `cornerLabels.ts`. Subject only to zoom floor + Mapbox collision.
- **Color-by** lives in `MapShell.tsx`: `const [colorBy, setColorBy] =
  useState<ColorBy>('stage')` (`ColorBy` from `FieldMap`), passed to `FieldMap`
  and `LayersPanel`. Currently session-only, hardcoded initial `'stage'`.
- `LiteMap.tsx` — Leaflet fallback; must keep label + color parity
  ("replicate, never redesign").
- Settings at `src/app/app/settings` (has a Colors sub-section).

## Locked decisions

1. **Shared default** for label fields across live map + print (one source of truth).
2. Live-map toggles are **per-device sticky** (localStorage), seeded from the default.
3. **Cross-device rule:** a newer saved default supersedes an older local tweak on
   load (version-tag by timestamp). See scenario below.
4. **Color-by** default is included, saved via **one "Save as default" pill** in the
   Layers panel; full editor also in Settings.
5. **DB column rename** `print_label_fields` → `label_fields`.

## Data model

### Migration `0046_view_defaults.sql`
- `alter table organizations rename column print_label_fields to label_fields;`
- `alter table organizations add column default_color_by text not null default 'stage'
  check (default_color_by in ('stage','variety'));`
- `alter table organizations add column view_defaults_updated_at timestamptz not null default now();`
- Verify no view / RLS policy references `print_label_fields` before renaming
  (grep migrations + `information_schema`); the rename and the code deploy ship
  **together** (old code reading a renamed column would 500).

Update all readers to `label_fields`: the 7 print pages and the API route.

### localStorage (per device)
- Key `headland-map-view` → JSON:
  `{ labelFields: LabelField[], colorBy: 'stage'|'variety', basedOn: string }`
  where `basedOn` is the ISO `view_defaults_updated_at` the local state was seeded
  from / last saved against.
- **Do not write the key on initial seed.** A device with no key always follows
  the current org default (so future default changes propagate). The key is
  written only when the user **actually changes a toggle** (or saves as default),
  at which point `basedOn` is stamped to the org's current
  `view_defaults_updated_at`.
- A local override is honored only while its `basedOn` still equals the org's
  current timestamp; once a newer default is saved anywhere (timestamp bumps),
  every device's older local override is stale and the new default wins on next load.
- Empty `labelFields: []` on a **local** override = explicit "no labels" (valid,
  clean view). An **absent key** = use the org default.

### Pure resolver (testable, no mapbox/react)
`resolveMapView(localRaw: string | null, def: { labelFields: LabelField[]; colorBy: 'stage'|'variety'; updatedAt: string }): { labelFields: LabelField[]; colorBy: 'stage'|'variety' }`
- Parse `localRaw`; if valid **and** `local.basedOn === def.updatedAt` → return
  `{ labelFields, colorBy }` from local. Else return the default.
- Malformed JSON / unknown fields → fall back to default (drop unknowns via
  `parseLabelFields`). Lives in `label-fields.ts` (or a small `map-view.ts`).

## Cross-device behavior (the phone scenario)

- Save default on the **laptop** → writes DB + bumps `view_defaults_updated_at`.
- **Phone** next refresh: its stored `basedOn` no longer matches the new
  timestamp → local override discarded → **phone shows the new default.** ✅
- Exception: if the phone toggled something **after** the laptop save, that local
  change re-stamped `basedOn` to the (now-current) timestamp → phone keeps its
  fresher tweak until the next save-as-default or a "Reset to default".

Plain rule: **most recent Save-as-default wins across devices; an unsaved local
toggle wins only on its own device, only until a newer default lands.**

## UI

### Layers panel (`LayersPanel.tsx`)
- New **"Labels"** section: 4 checkboxes from `LABEL_FIELD_NAMES`, bound to
  `viewPrefs.labelFields`. Zero-selected is allowed (clean map).
- Existing color-by control stays as-is (now seeded from `viewPrefs.colorBy`).
- One small **"Save as default"** pill at the panel bottom → promotes the **whole
  current view** (`labelFields` + `colorBy`) to the org default. Disabled with a
  hint when zero labels are selected (can't save "no labels" as the org default;
  live view still allows zero).
- Small **"Reset to default"** link → clear `headland-map-view`, re-pull org default.

### Settings (`app/settings`)
- New **"Map & print labels"** section near Colors: the 4 label checkboxes + a
  color-by radio (Crop stage / Variety). Saves via the same endpoint.

## Live-map wiring

- `MapShell` owns `viewPrefs = { labelFields, colorBy }`, initialized via
  `resolveMapView(localStorage.getItem('headland-map-view'), viewDefaults)` where
  `viewDefaults` (`label_fields`, `default_color_by`, `view_defaults_updated_at`)
  is a prop from the server parent (map route already loads org). Replaces the
  hardcoded `useState('stage')`. Persist to localStorage on every change (stamping
  `basedOn`).
- `labelFields` → `FieldMap`: on change,
  `map.setLayoutProperty(layerId, 'visibility', on ? 'visible' : 'none')` for each
  of the four layers. Field→layer map: `name`→`field-label-id`,
  `variety`→`field-label-variety`, `acres`→`field-label-acres`, `cut`→`fields-label`.
  Cheap; no source rebuild. A label turned off stays off even in spray/filter mode.
- `colorBy` → existing color path (already wired), now seeded from prefs.
- `LiteMap` — mirror `viewPrefs`: show/hide the corresponding Leaflet label
  elements and apply color-by, for full parity.

## API

- Rename `POST /api/print-prefs` → `POST /api/view-defaults` (extend body).
  Accept `{ fields: LabelField[] (min 1, max 4), colorBy?: 'stage'|'variety',
  paper?: ... }`. Writes `label_fields`, `default_color_by` (when present), bumps
  `view_defaults_updated_at`. Return the new `updatedAt` so the client can stamp
  `basedOn` after a save.
- Update callers: `SaveDefaultsButton.tsx`, the new Layers-panel pill, the Settings
  section. Internal endpoint — no back-compat shim needed.

## Testing

- **Unit:** `resolveMapView` — `basedOn` match vs mismatch, empty local array
  (explicit none), absent key, malformed JSON, unknown fields dropped.
- **Manual / Playwright at 390 / 810 / 1440** (blocking pre-launch):
  - Toggling each label hides/shows its layer; color-by switches palette.
  - "Save as default" from the map persists; reload keeps it.
  - Fresh device (clear localStorage) seeds from the org default.
  - Cross-device propagation: change default, simulate second device (clear local),
    confirm it picks up the new default; confirm a post-save local tweak survives.
  - `LiteMap` parity via `?lite=1` — same labels shown/hidden, same color-by.
- **Deploy discipline:** migration + code ship together; batch to **evening**
  (no daytime deploys — growers are on the map).

## Out of scope (YAGNI)

- Per-**user** defaults — defaults stay org-level (team setting), matching print.
- Any label beyond the existing four; any color-by mode beyond stage/variety.
- Renaming `print_paper` or other unrelated org columns.

## Files touched (~9)

- `supabase/migrations/0046_view_defaults.sql` (rename + 2 columns)
- `src/lib/label-fields.ts` (+ `resolveMapView`, or new `map-view.ts`)
- `src/components/map/MapShell.tsx`, `FieldMap.tsx`, `LiteMap.tsx`, `LayersPanel.tsx`
- `src/app/api/print-prefs/route.ts` → `src/app/api/view-defaults/route.ts`
- `src/components/print/SaveDefaultsButton.tsx` (endpoint + payload)
- The 7 print pages reading `org.print_label_fields` (column-name change)
- `src/app/app/settings/…` new "Map & print labels" section
