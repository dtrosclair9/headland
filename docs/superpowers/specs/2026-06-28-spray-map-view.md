# Spray Map View — Design

**Date:** 2026-06-28
**Author:** Dayne Trosclair (Strykora) + Claude
**Status:** Approved (design)

## Purpose

Growers hand printed field maps to aerial (sprayer-plane) pilots. A pilot needs a
**black-and-white** map — white blocks, black boundaries — so they can color/highlight the
blocks they have already sprayed as they work. The current printed map ("Crop map") fills
each block with its ratoon color, which is useless for a pilot who needs to mark on top of
it.

Add a third map style, **"Spray map"**: a plain white-fill / black-outline plat sheet with
each block labeled by **name + acres**, available both as an on-screen view (so the grower
can preview it) and as the printed output. View-and-print only — no editing in this mode.

## Requirements

- A third toggle on the interactive map, labeled **"Spray map"**, sitting next to
  "Satellite" and "Crop map" and styled identically (an obvious peer, not a hidden option).
- In Spray-map view and on the printed sheet:
  - Block fill is **white** (`#FFFFFF`).
  - Block boundaries are **solid black**, drawn thicker than the crop map for legibility.
  - Every block is labeled with its **name + acres in black**.
  - **No ratoon colors and no color legend.**
- **Every block is always labeled** — including small/skinny blocks. The font shrinks to a
  small floor to fit (no block is left nameless). This is the whole point: a pilot must be
  able to read which block is which.
- Spray-map view is **read-only**: block drawing is disabled while it is active.
- Print **follows the view**: when the grower is in Spray-map view, the existing print
  actions output the B&W sheet (via a `?style=spray` query param) and **relabel to "Print
  spray map"** so it's obvious what they'll get.

## Out of scope (YAGNI)

- Numbered blocks + a side index/legend (the option-B fallback). Revisit only if real farms
  turn out to have so many slivers that shrink-to-fit names become unreadable.
- "Sprayed?" checkboxes, a tracking column, or filtering blocks by crop stage — the pilot
  marks the printout by hand; we just give them a clean canvas.
- A spray-map variant of the **single-field detail print** (`/fields/[id]/print`). That route
  is a metadata sheet (harvest/operations tables), not a map, and a one-block spray map is
  pointless. Spray style applies only to the two map sheets below.
- Any data-model change. This is purely a rendering style over existing blocks.

## Architecture

Two render paths already exist and stay separate; we add a spray style to each.

### 1. Print SVG builder — `src/lib/plantation-map-svg.ts`

`buildPlantationSvg()` does all the geometry work (equirectangular projection, best-fit
rotation, scaling, per-block polygon points + centroid labels). We do **not** duplicate that.

- Extract the shared projection/rotation/scale + per-block point/label computation into one
  internal helper so both styles share it. The only per-style differences are:
  - **color**: crop → `colorForRatoon(...)`; spray → `'#FFFFFF'`.
  - **showName**: crop → `minDim > 40`; spray → **always `true`**.
  - **fontSize floor**: crop → `clamp(minDim * 0.16, 6, 15)`; spray → a lower floor (e.g.
    `clamp(minDim * 0.16, 4.5, 15)`) so tiny blocks still get a (small) name.
- Add **`buildSpraySvg(blocks, opts)`** returning the same `PlantationSvg` shape (so
  `PlatSheet` renders it unchanged). `stagesPresent`/`hasUnset` are returned but unused by
  the spray sheet (it draws no legend).

### 2. Print sheet — `src/components/print/PlatSheet.tsx`

Add a `style?: 'crop' | 'spray'` prop (default `'crop'`):

- `spray`: polygons render `fill={b.color}` (already white from the builder) with
  **`stroke="#000000"`** at a heavier `strokeWidth` (~1.1–1.4 vs the crop sheet's 0.8);
  block text stays black. The header **color legend is omitted** (no `legendItems`, no
  "No cut set" chip). The footer caption changes from "Colored by year cane" to a
  spray-appropriate line (e.g. "Outline map for spraying — blocks by name and acreage.").
- `crop`: unchanged.

### 3. Print routes (two of three)

`/blocks/print` and `/plantations/[id]/print` each:

- Read an optional **`?style=spray`** search param (`style === 'spray' ? 'spray' : 'crop'`).
- Call `buildSpraySvg(...)` instead of `buildPlantationSvg(...)` when spray.
- Pass `style` through to `PlatSheet`; pass `legendItems={[]}` when spray.

`/fields/[id]/print` is untouched (see out-of-scope).

### 4. Interactive map — lift `viewMode` to `MapShell`

`viewMode` currently lives inside `FieldMap`, but the print links live in `FieldSidebar`;
both are siblings under `MapShell`. So:

- **`MapShell`** owns `const [viewMode, setViewMode] = useState<ViewMode>('satellite')` and
  passes it to both children.
- **`FieldMap`** takes `viewMode` + `setViewMode` as props (replacing its local state).
  - `ViewMode = 'satellite' | 'crop' | 'spray'`.
  - Add the **"Spray map"** button to the toggle group (same styling).
  - View-mode effect gains a `spray` branch: white background (reuse the crop
    branch's layer-hiding), **fill-opacity 1 with fill-color `#FFFFFF`** for all blocks,
    **outline black `#000000` at width ~2.5**, label = `cropLabelExpression()` (name +
    acres) with **black text + a thin white halo** for readability over the black outline.
    The selected block may keep its orange outline so on-screen selection is still visible
    (print is unaffected — print never uses the live map).
  - **Read-only:** disable the Draw button when `viewMode === 'spray'` (force-exit draw if
    entering spray mid-draw). Select/reposition are sidebar-initiated and unaffected.
- **`FieldSidebar`** takes `viewMode` as a prop. Its two map print links
  (plantation "Print", "Print N selected") append `?style=spray` and relabel their text to
  "Print spray map" / "Spray map of N selected →" when `viewMode === 'spray'`.

## Files touched

- `src/lib/plantation-map-svg.ts` — extract shared geometry helper; add `buildSpraySvg`.
- `src/components/print/PlatSheet.tsx` — `style` prop; black stroke + no legend for spray.
- `src/app/blocks/print/page.tsx` — read `?style`, branch builder + pass style.
- `src/app/plantations/[id]/print/page.tsx` — read `?style`, branch builder + pass style.
- `src/components/map/MapShell.tsx` — own `viewMode`; pass to `FieldMap` + `FieldSidebar`.
- `src/components/map/FieldMap.tsx` — `viewMode`/`setViewMode` props; `'spray'` mode +
  toggle button + spray render + draw lockout.
- `src/components/map/FieldSidebar.tsx` — `viewMode` prop; spray-aware print links.

## Testing / verification

- `npm run typecheck` and `npm run build` clean.
- Visual at **390 / 810 / 1440** on the map: the three-way toggle fits and reads clearly;
  Spray-map view shows white blocks, black outlines, readable name + acres labels; Draw is
  disabled.
- **Print preview on a real farm's geometry** (plantation print `?style=spray` and selected
  blocks `?style=spray`): confirm every block — including the smallest — shows a legible
  name, the sheet is pure black-and-white with no legend, and it lands on one landscape page.
- Confirm the crop map and existing prints are visually unchanged (no regression).
