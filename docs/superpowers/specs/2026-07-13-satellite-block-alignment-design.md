# Satellite Block Alignment — Design

**Problem.** Imported or hand-drawn farm blocks are always slightly off from where the
field actually sits — the #1 problem in ag mapping, true even of FSA data. The satellite
shows the truth: ditches (dark lines), headlands (green strips), tree lines, field-color
edges. Goal: auto-align blocks to those real boundaries.

## Decisions (locked with Dayne 2026-07-13)
- **Scope:** Trosclair Farms → Rosedale only (Dayne's dev account; live edits OK if safe).
- **Per-block** (errors are a mix of per-block position/rotation/shape).
- **Propose-and-approve** — nothing moves until Dayne accepts; the review overlay IS the test.
- **Reshape to fit + recompute acreage.** Satellite is the source of truth. A ditch/headland
  is real land that isn't the field, so hugging it makes acreage *more* accurate. This
  deliberately reverses the app's usual "acreage is sacred" rule for this feature.

## Method
Primary: **linear-feature snapping** — detect dominant straight boundaries (ditch/headland/
road/tree line) as vector lines, snap block edges to the nearest matching line. Matches the
mental model ("snap the shared edge to that ditch"), robust because it commits only to
strong long straight features and ignores cane-row texture. Fallback: edge-strength
registration for non-linear edges. (AI field-segmentation = someday, not now.)

## Phasing — each phase is an image Dayne judges; no real data changes until Phase 3.
- **Phase 0 (feasibility spike, FIRST):** fetch Rosedale satellite (georeferenced), run
  edge/darkness/greenness + line detection, render overlays with current blocks on top.
  One question: *do the ditches/headlands pop out cleanly, or does cane-row texture drown
  them?* Cheap; decides whether the rest is real. Read-only, no data touched.
- **Phase 1:** rigid best-fit per block (translate+rotate onto detected boundaries), old-vs-
  proposed overlay.
- **Phase 2:** reshape/carve to boundaries (hug ditch, carve headland) + recompute acreage.
- **Phase 3:** in-app propose/approve flow on a plantation.

## Tools
Node scripts (like scripts/shoot-*.mjs). sharp (0.34.5, installed) for raster processing,
Mapbox Static Images API (NEXT_PUBLIC_MAPBOX_TOKEN) for georeferenced satellite, postgres
for geometry. Pixel↔lng/lat via linear bbox mapping (sub-meter over ~1km; Mercator error
negligible at farm scale).

## Risk
Genuine CV on noisy imagery. Riskiest assumption = *seeing* the boundaries amid cane-row
texture. Phase 0 tests exactly that, cheaply, before any optimizer is built.
