# Layers, Custom Colors & Annotations — design notes

Shipped 2026-07-07 from farmer feedback (FarmWorks is the mental model —
"layers" is the grower vocabulary). Four connected features; this records the
architecture and the decisions so later work doesn't fight them.

## Layers & filters (map sidebar → Layers tab)

- **Model** (`src/components/map/layer-filter.ts`): `{ stages[], varieties[],
  plantations[] }`. **OR within a group, AND across groups** — "plant cane +
  L 01-299 + Rosedale" = intersection. Empty filter = normal map.
- Matching ids computed in `MapShell`; `FieldMap` stamps a `dim` property on
  every geojson feature. Dim blocks: **white fill** (0.75 opacity on satellite,
  solid on crop) with labels hidden via layer filters. Matches keep colors +
  labels. Camera intentionally does NOT refit on filter changes.
- Panel (`LayersPanel.tsx`) shows live match count + combined acreage and a
  "Print these N blocks" link that feeds `/blocks/print?ids=…`.

## Color-by (the palette conflict)

A stage filter and a variety filter would fight over block colors. Resolution:
**filters pick WHICH blocks light up; a separate "Color by" toggle (Year cane |
Variety) picks WHAT paints them.** Legend follows the active palette.

## Custom colors

- `org_colors` (org_id, kind 'stage'|'variety', key, color) — **overrides
  only**; defaults live in code (`ratoon-colors.ts`, `variety-colors.ts`).
- Single resolution point: `src/lib/resolve-colors.ts`. Everything that paints
  blocks goes through it: map fill, legend, Layers-tab dots, and all three
  print sheets + their legends. Never read RATOON_COLORS directly for painting.
- Settings → Map colors (`/app/settings/colors`): native `<input type=color>`
  per stage + per variety on the farm; saves on pick (debounced), Reset per
  row. API: `POST /api/colors` (color=null clears).
- Default variety palette assigns alphabetically; cyan-family hues are last so
  they can't shadow the "not set" cyan.

## Annotations (hand-drawn reference layer)

- `map_annotations` (kind 'line'|'text', geometry jsonb, text, color). Farm-
  wide, org RLS. API: GET/POST `/api/annotations`, DELETE `/api/annotations/:id`.
- Map tools next to "Draw a block": **Line** (mapbox-draw `draw_line_string`,
  double-click to finish) and **Text** (one-shot placement click → overlay
  input). Click an annotation outside draw modes → Delete popup.
- Draw modes swallow block clicks (`drawKindRef` guard in the `fields-fill`
  click handler) — without it, clicking line points over a block selected the
  block and popped its card.
- Prints: `buildSvg` projects annotations with the same rotate/flip as blocks
  (`SvgAnnotation` on `PlantationSvg`); framing stays block-driven, anything
  off-page clips. Crop sheet: annotation's color. Spray sheet: solid black.

## Fly plan == the spray sheet

Per the farmer's spec, the fly plan is the B&W sheet with **only block id +
acreage + hand-drawn annotations**. `buildSvg` blanks cut/variety for
`style === 'spray'`; the crop sheet keeps the full corner-label set (name TL,
v-code TR, acres BR, cut center — see `planCornerLabels`, which ray-casts the
block interior so labels stay inside tilted parallelograms).

## Verification harnesses (scripts/, env-driven, run against dev server)

- `reseed-ui-test.mjs` — resets the UI Test Farm: angled blocks with varieties,
  cuts, two plantations.
- `shoot-layers.mjs` — walks the filter flow at 1440/390/810 and screenshots.
- `shoot-colors.mjs` — sets overrides via the real API, screenshots settings/
  map/print, then resets.
- `shoot-annotations.mjs` — draws a line + places text via real mouse events,
  screenshots map + both prints + delete popup, then cleans up.

Gotcha that bit twice: **never `npm run build` while `next dev` is running**
(corrupts `.next`; MODULE_NOT_FOUND 500s — kill dev first).
