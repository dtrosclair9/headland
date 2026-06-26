# Monthly Farm Snapshots — Design

**Date:** 2026-06-25
**Author:** Dayne Trosclair (Strykora) + Claude
**Status:** Approved (design)

## Purpose

Automatically capture a dated, re-importable archive of each farm's full state every
month, browsable and downloadable in the app, so a grower always has a year-by-year
record of their operation and a complete data-loss-rescue backup. Reinforces Headland's
core promise: *you always have a dated file, even if something happens.*

A snapshot is a **frozen point-in-time** copy. This matters because the map state changes
over time (ratoon cuts advance, varieties get replanted); the live data can't reconstruct
what June looked like in December, so we must capture it each month.

## Requirements

- Automatic monthly snapshot per farm, no user action required.
- Each snapshot is a single dated `.zip`:
  - blocks as **shapefile** (`.shp/.shx/.dbf/.prj/.cpg`) and **GeoJSON**
  - **harvests**, **sprays**, **scouting** as CSVs
  - a `README.txt` with the snapshot date + farm totals
- Browse and download every past snapshot in the app; kept forever.
- A manual **"Create snapshot now"** option.

## Out of scope (YAGNI)

- In-app "restore this snapshot" (the zip re-imports through the existing import flow if
  ever needed).
- Email delivery of snapshots.
- Cadences other than monthly.
- Per-plantation snapshots (full farm only).

## Data model

New table **`farm_snapshots`**:

| column | type | notes |
|---|---|---|
| `id` | uuid pk default gen_random_uuid() | |
| `org_id` | uuid not null → organizations(id) on delete cascade | |
| `period` | date not null | first day of the snapshot month (e.g. 2026-06-01) |
| `trigger` | text not null | `'auto'` or `'manual'` |
| `storage_path` | text not null | object key in the `farm-snapshots` bucket |
| `file_size` | bigint | |
| `block_count` | int not null default 0 | |
| `acreage` | numeric(12,2) not null default 0 | |
| `harvest_count` | int not null default 0 | |
| `spray_count` | int not null default 0 | |
| `created_at` | timestamptz not null default now() | |

- Index `(org_id, period desc)`.
- Unique partial index `(org_id, period) where trigger = 'auto'` — a month can't double
  auto-snapshot; manual snapshots may repeat.
- RLS enabled: `select` policy `is_org_member(org_id)`; **no client insert/update/delete**
  — writes happen only in service-role server code.

## Storage

- Private Supabase Storage bucket **`farm-snapshots`** (not public).
- Object path: `{org_id}/{YYYY-MM}.zip` (auto); `{org_id}/{YYYY-MM}-manual-{epoch}.zip`
  (manual, to avoid collisions).
- Downloads never expose the bucket: a server route validates org ownership and returns a
  short-lived **signed URL**.

## Snapshot generation — `generateFarmSnapshot(orgId, trigger)`

Server-side, service role. In `src/lib/snapshots.ts`.

1. Load the org's farm state:
   - `fields` (non-archived): geometry, name, plantation, variety, plant_date,
     current_ratoon, acreage_cached, arpents_cached
   - `plantations` (names)
   - `harvests` (block, year, tons, harvest_date)
   - `applications` (block, product, rate, date, wind dir/speed)
   - `scouting_pins` (block, lat/lng, note, photo url, date)
2. Build the zip in-memory (JSZip):
   - `blocks.shp/.shx/.dbf/.prj/.cpg` via the shared export builder
   - `blocks.geojson` (WGS84 FeatureCollection)
   - `harvests.csv`, `sprays.csv`, `scouting.csv`
   - `README.txt` (farm name, snapshot date, totals)
3. Upload to `farm-snapshots` at the path above.
4. Insert the `farm_snapshots` metadata row (counts, acreage, size, trigger, period).

Idempotent for `auto`: if an `auto` row exists for the period, skip. Returns the row.

**Targeted refactor:** `src/app/api/export/shapefile/route.ts` builds the shapefile inline.
Extract the shared block→shapefile/GeoJSON logic into **`src/lib/farm-export.ts`** so the
live export and the snapshot share one code path. No unrelated changes.

## Trigger

### Automatic (Vercel Cron)

- `vercel.json`: `{ "crons": [{ "path": "/api/snapshots/run", "schedule": "0 6 1 * *" }] }`
  (06:00 UTC on the 1st of each month).
- `/api/snapshots/run` (Node runtime):
  - Auth: require `Authorization: Bearer ${CRON_SECRET}`; reject otherwise (401).
  - Find all orgs with ≥1 non-archived block. For each: skip if an `auto` snapshot exists
    for the current period, else `generateFarmSnapshot(orgId, 'auto')`.
  - Per-org try/catch so one failure doesn't sink the run; log failures; return
    `{ created, skipped, failed }`.
- **Scale note:** launch handles all orgs in a single invocation. At 100s of farms, switch
  to batching (process N per run with continuation, or enqueue per-org). Flagged, not built.

### Manual

- `/api/snapshots/create` (POST, `requireUserAndOrg`): `generateFarmSnapshot(org.id, 'manual')`.
  Backs the "Create snapshot now" button.

## Viewing / download

- `src/app/app/export/page.tsx` gains a **"Monthly archive"** section:
  - Lists the org's snapshots (period, block/record counts, size, trigger), newest first.
  - A **Download** button per row → `/api/snapshots/[id]/download`.
  - A **"Create snapshot now"** button (small client component) → POST `/api/snapshots/create`.
  - Empty state: "Your first monthly snapshot is created automatically on the 1st — or make
    one now."
- `/api/snapshots/[id]/download` (GET, `requireUserAndOrg`): load the snapshot, verify
  `snapshot.org_id === org.id` (else 403), return a short-lived signed URL for the object.
  Mirrors the org-ownership guard the imagery routes already use.

## Security

- Private bucket; every download is org-scoped through the server (403 on mismatch).
- Cron endpoint gated by `CRON_SECRET`.
- Snapshot generation uses the service role server-side only; no secrets reach the client.

## Files touched

- `supabase/migrations/0024_farm_snapshots.sql` — table, indexes, RLS (bucket created in the
  Supabase dashboard or via SQL).
- `src/lib/farm-export.ts` — shared block→shapefile/GeoJSON builder + CSV builders.
- `src/lib/snapshots.ts` — `generateFarmSnapshot(orgId, trigger)`.
- `src/app/api/snapshots/run/route.ts` — cron endpoint.
- `src/app/api/snapshots/create/route.ts` — manual.
- `src/app/api/snapshots/[id]/download/route.ts` — download.
- `src/app/app/export/page.tsx` (+ a small client button component) — archive UI.
- `vercel.json` — cron schedule.
- `src/app/api/export/shapefile/route.ts` — refactored onto the shared lib.
- Env/infra: `CRON_SECRET` (Vercel), `farm-snapshots` Storage bucket.

## Testing / verification

- Snapshot builder produces a valid zip with the expected files for a seeded org (verify via
  a script / the UI test harness).
- Manual: "Create snapshot now" on the test farm → row appears → download → zip opens with
  blocks + CSVs + README.
- Cron: call `/api/snapshots/run` with the secret → snapshots created for orgs with blocks;
  re-run is idempotent (skips).
- New archive UI checked at 390 / 810 / 1440.
