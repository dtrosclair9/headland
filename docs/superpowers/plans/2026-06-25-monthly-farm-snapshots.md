# Monthly Farm Snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every month, automatically capture a dated, re-importable zip of each farm's full state, browsable and downloadable forever in `/app/export`.

**Architecture:** A Vercel Cron (1st of month) and a manual button both call `generateFarmSnapshot(orgId, trigger)`, which loads the farm's blocks + records, builds a zip (shapefile + GeoJSON + CSVs + README) via a shared `farm-export` lib, uploads it to a private `farm-snapshots` Storage bucket, and records metadata in a new `farm_snapshots` table. The app lists/downloads snapshots via org-scoped, signed-URL routes. (Approach A — file in Storage, metadata in the backed-up DB.)

**Tech Stack:** Next.js 15 App Router (Node runtime routes), Supabase (Postgres + Storage), `jszip` 2.x, existing `@/lib/shapefile` builder, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-06-25-monthly-farm-snapshots-design.md`

## Global Constraints

- **No test runner exists** (no jest/vitest). Verify pure logic with a standalone `node` script under `scripts/` (pattern: `scripts/verify-pricing.mjs`); verify types with `npx tsc --noEmit`; verify the build with `npm run build`; verify integration via the Supabase-admin + Playwright harness (pattern: `scripts/_shot-billing.mjs`, run against the `UI Test Farm` org). Do not add a test framework.
- **Never run `next build` while `next dev` is running** (corrupts `.next`).
- **Server-only secrets:** snapshot generation uses the Supabase **service role** (`@/lib/supabase/admin`) and must only be imported by server code (route handlers, server libs) — never a `'use client'` file.
- **Org isolation:** every download route must verify `snapshot.org_id === org.id` (403 otherwise), mirroring `src/app/api/fields/[id]/ndvi/route.ts`'s guard — do not rely on RLS alone here.
- **Commit message hook:** the danger tripwire blocks commit messages containing the literal string `.env` — describe env vars as "environment variable", not `.env.local`.
- **Co-author trailer on every commit:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `farm_snapshots` table + private Storage bucket (migration)

**Files:**
- Create: `supabase/migrations/0024_farm_snapshots.sql`

**Interfaces:**
- Produces: table `farm_snapshots(id, org_id, period date, trigger text, storage_path text, file_size bigint, block_count int, acreage numeric, harvest_count int, spray_count int, created_at)`; private Storage bucket `farm-snapshots`. Later tasks insert via the service role and select via `is_org_member(org_id)`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0024_farm_snapshots.sql
-- Monthly (and manual) frozen snapshots of a farm's full state. The zip file
-- lives in the private `farm-snapshots` Storage bucket; this row is the
-- backed-up metadata index.
create table farm_snapshots (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  period        date not null,                 -- first day of the snapshot month
  trigger       text not null check (trigger in ('auto', 'manual')),
  storage_path  text not null,
  file_size     bigint,
  block_count   int not null default 0,
  acreage       numeric(12, 2) not null default 0,
  harvest_count int not null default 0,
  spray_count   int not null default 0,
  created_at    timestamptz not null default now()
);
create index on farm_snapshots (org_id, period desc);
-- A month can only auto-snapshot once; manual snapshots may repeat.
create unique index farm_snapshots_auto_period
  on farm_snapshots (org_id, period) where trigger = 'auto';

alter table farm_snapshots enable row level security;
create policy "members read own org snapshots" on farm_snapshots
  for select using (is_org_member(org_id));
-- No insert/update/delete policy: only the service role (which bypasses RLS)
-- writes snapshots.

-- Private bucket for the zip files. Service role reads/writes; downloads are
-- handed to users as short-lived signed URLs, so no public/user storage policy
-- is needed.
insert into storage.buckets (id, name, public)
values ('farm-snapshots', 'farm-snapshots', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Apply the migration**

Run: `node --env-file=.env.local scripts/run-migration.cjs supabase/migrations/0024_farm_snapshots.sql`
(If `run-migration.cjs` takes no arg / differs, apply the SQL via the Supabase dashboard SQL editor instead. Confirm how it works by reading `scripts/run-migration.cjs` first.)

- [ ] **Step 3: Verify the table + bucket exist**

Run:
```bash
node --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {auth:{persistSession:false}});
(async () => {
  const { error: t } = await a.from('farm_snapshots').select('id').limit(1);
  console.log('table:', t ? 'ERROR '+t.message : 'ok');
  const { data: b } = await a.storage.listBuckets();
  console.log('bucket farm-snapshots:', b?.some(x=>x.id==='farm-snapshots') ? 'ok' : 'MISSING');
})();
"
```
Expected: `table: ok` and `bucket farm-snapshots: ok`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0024_farm_snapshots.sql
git commit -m "Snapshots: farm_snapshots table + private storage bucket

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Shared `farm-export` lib + refactor the export route

**Files:**
- Create: `src/lib/farm-export.ts`
- Modify: `src/app/api/export/shapefile/route.ts` (refactor onto the lib — keep behavior identical)
- Create: `scripts/verify-farm-export.mjs` (throwaway verification; delete after)

**Interfaces:**
- Consumes: `buildShapefile`, `type ShpField` from `@/lib/shapefile`; `FieldRow` from `@/lib/fields`; `Plantation` from `@/lib/types`; `Organization` from `@/lib/types`.
- Produces:
  - `buildFieldsShapefileSet(fields: FieldRow[], plantations: Plantation[], org: Pick<Organization,'fsa_farm_number'>): { shp: Buffer; shx: Buffer; dbf: Buffer; prj: string; cpg: string }`
  - `buildFieldsGeoJSON(fields: FieldRow[]): string`
  - `harvestsCsv(rows: HarvestExportRow[]): string`
  - `spraysCsv(rows: SprayExportRow[]): string`
  - `scoutingCsv(rows: ScoutingExportRow[]): string`
  - the row types `HarvestExportRow`, `SprayExportRow`, `ScoutingExportRow` (defined below)
  - `NAD83_PRJ: string`

- [ ] **Step 1: Create `src/lib/farm-export.ts`**

Move `NAD83_PRJ` and the `FIELDS: ShpField[]` schema out of the export route, and add the builders. Use the EXACT feature-value order the current route uses (see `src/app/api/export/shapefile/route.ts:41-59`).

```ts
import { buildShapefile, type ShpField } from '@/lib/shapefile'
import type { FieldRow } from '@/lib/fields'
import type { Organization, Plantation } from '@/lib/types'

// NAD83 (EPSG:4269) — the datum USDA FSA uses.
export const NAD83_PRJ =
  'GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]'

const FIELDS: ShpField[] = [
  { name: 'name', type: 'C', length: 50 },
  { name: 'acres', type: 'N', length: 13, decimals: 3 },
  { name: 'arpents', type: 'N', length: 13, decimals: 3 },
  { name: 'variety', type: 'C', length: 20 },
  { name: 'plant_dt', type: 'C', length: 10 },
  { name: 'cut', type: 'C', length: 20 },
  { name: 'plantation', type: 'C', length: 50 },
  { name: 'farm', type: 'C', length: 10 },
  { name: 'tract', type: 'C', length: 10 },
  { name: 'notes', type: 'C', length: 100 },
]

function polygonFields(fields: FieldRow[]) {
  return fields.filter(
    (f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  )
}

export function buildFieldsShapefileSet(
  fields: FieldRow[],
  plantations: Plantation[],
  org: Pick<Organization, 'fsa_farm_number'>,
) {
  const tractByName = new Map(plantations.map((s) => [s.name, s.fsa_tract_number ?? '']))
  const farmByName = new Map(
    plantations.map((s) => [s.name, s.fsa_farm_number ?? org.fsa_farm_number ?? '']),
  )
  const features = polygonFields(fields).map((f) => ({
    geometry: f.geometry,
    values: [
      f.name ?? '',
      Number(f.acreage_cached || 0),
      Number(f.arpents_cached || 0),
      f.variety ?? '',
      f.plant_date ?? '',
      f.current_ratoon ? f.current_ratoon.replace(/_/g, ' ') : '',
      f.plantation_name ?? '',
      f.plantation_name
        ? (farmByName.get(f.plantation_name) ?? org.fsa_farm_number ?? '')
        : (org.fsa_farm_number ?? ''),
      f.plantation_name ? (tractByName.get(f.plantation_name) ?? '') : '',
      f.notes ?? '',
    ],
  }))
  const { shp, shx, dbf } = buildShapefile(FIELDS, features)
  return { shp, shx, dbf, prj: NAD83_PRJ, cpg: 'UTF-8' }
}

export function buildFieldsGeoJSON(fields: FieldRow[]): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: polygonFields(fields).map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        name: f.name ?? '',
        acres: Number(f.acreage_cached || 0),
        arpents: Number(f.arpents_cached || 0),
        variety: f.variety ?? '',
        plant_date: f.plant_date ?? '',
        cut: f.current_ratoon ?? '',
        plantation: f.plantation_name ?? '',
        notes: f.notes ?? '',
      },
    })),
  })
}

// --- CSV builders ---------------------------------------------------------

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function csv(headers: string[], rows: (string | number | null)[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}

export type HarvestExportRow = { block: string; harvest_year: number; tons_total: number | null; tons_per_acre: number | null; notes: string | null }
export type SprayExportRow = { block: string; applied_at: string; product: string; type: string; rate: number | null; unit: string | null; wind_dir: string | null; wind_speed: number | null; notes: string | null }
export type ScoutingExportRow = { block: string; category: string; note: string | null; created_at: string }

export function harvestsCsv(rows: HarvestExportRow[]): string {
  return csv(
    ['block', 'harvest_year', 'tons_total', 'tons_per_acre', 'notes'],
    rows.map((r) => [r.block, r.harvest_year, r.tons_total, r.tons_per_acre, r.notes]),
  )
}
export function spraysCsv(rows: SprayExportRow[]): string {
  return csv(
    ['block', 'applied_at', 'product', 'type', 'rate', 'unit', 'wind_dir', 'wind_speed', 'notes'],
    rows.map((r) => [r.block, r.applied_at, r.product, r.type, r.rate, r.unit, r.wind_dir, r.wind_speed, r.notes]),
  )
}
export function scoutingCsv(rows: ScoutingExportRow[]): string {
  return csv(
    ['block', 'category', 'note', 'created_at'],
    rows.map((r) => [r.block, r.category, r.note, r.created_at]),
  )
}
```

NOTE: confirm the actual `applications` wind column names by reading `supabase/migrations/0013_ditches_and_spray_wind.sql`; adjust `wind_dir`/`wind_speed` in `SprayExportRow` + `spraysCsv` + the Task-3 query to match (e.g. `wind_direction`, `wind_speed_mph`).

- [ ] **Step 2: Refactor the export route onto the lib**

Replace the body of `src/app/api/export/shapefile/route.ts` so it imports from `@/lib/farm-export` and removes the now-duplicated `NAD83_PRJ`/`FIELDS`/feature-mapping:

```ts
import { NextResponse } from 'next/server'
// @ts-expect-error - jszip 2.x ships no types
import JSZip from 'jszip'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'
import { listPlantations } from '@/lib/plantations'
import { buildFieldsShapefileSet } from '@/lib/farm-export'

export async function GET() {
  const { org } = await requireUserAndOrg()
  const [fields, plantations] = await Promise.all([listFields(org.id), listPlantations(org.id)])
  const { shp, shx, dbf, prj, cpg } = buildFieldsShapefileSet(fields, plantations, org)

  const zip = new JSZip()
  zip.file('fields/fields.shp', shp)
  zip.file('fields/fields.shx', shx)
  zip.file('fields/fields.dbf', dbf)
  zip.file('fields/fields.prj', prj)
  zip.file('fields/fields.cpg', cpg)
  const buffer = zip.generate({ type: 'nodebuffer', compression: 'STORE' }) as Buffer

  const safeOrg = org.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeOrg}-fields-shapefile.zip"`,
    },
  })
}
```

- [ ] **Step 3: Verify CSV builders with a node script**

Create `scripts/verify-farm-export.mjs` that re-implements the same `csv`/`csvCell` + calls the CSV shapes with sample rows and asserts quoting/escaping (mirror the constants — this is a throwaway check like `scripts/verify-pricing.mjs`). Minimal:

```js
// scripts/verify-farm-export.mjs
const csvCell = (v) => { const s = v==null?'':String(v); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s }
const csv = (h, rows) => [h, ...rows].map(r=>r.map(csvCell).join(',')).join('\n')+'\n'
const out = csv(['block','note'], [['5a','has, comma'], ['7b','has "quote"'], ['9c', null]])
const expected = 'block,note\n5a,"has, comma"\n7b,"has ""quote"""\n9c,\n'
console.log(out === expected ? 'CSV escaping ✓' : 'FAIL\n'+JSON.stringify(out))
process.exit(out === expected ? 0 : 1)
```
Run: `node scripts/verify-farm-export.mjs` → Expected: `CSV escaping ✓`.

- [ ] **Step 4: Typecheck + build (export route still compiles)**

Run: `npx tsc --noEmit && npm run build 2>&1 | grep -E "Compiled successfully|error TS"`
Expected: `Compiled successfully`, no `error TS`.

- [ ] **Step 5: Commit (and delete the throwaway script)**

```bash
rm scripts/verify-farm-export.mjs
git add src/lib/farm-export.ts src/app/api/export/shapefile/route.ts
git commit -m "Snapshots: shared farm-export lib (shapefile/geojson/csv); refactor export route

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `generateFarmSnapshot` + snapshot queries

**Files:**
- Create: `src/lib/snapshots.ts`
- Create: `scripts/verify-snapshot.mjs` (throwaway integration check; delete after)

**Interfaces:**
- Consumes: `createAdminClient` from `@/lib/supabase/admin`; `getBillableAcres` from `@/lib/acreage`; the `@/lib/farm-export` builders; `jszip`.
- Produces:
  - `generateFarmSnapshot(orgId: string, trigger: 'auto' | 'manual'): Promise<{ id: string; skipped?: boolean }>`
  - `listSnapshots(orgId: string): Promise<FarmSnapshotRow[]>`
  - `getSnapshot(id: string): Promise<FarmSnapshotRow | null>`
  - `type FarmSnapshotRow = { id; org_id; period; trigger; storage_path; file_size; block_count; acreage; harvest_count; spray_count; created_at }`

- [ ] **Step 1: Implement `src/lib/snapshots.ts`**

Load farm state with the admin client (RLS-bypassing, server-only), build the zip with the `farm-export` lib, upload, insert the row. Key points: `period` = first day of the current UTC month; for `auto`, skip if a row already exists for `(org_id, period, trigger='auto')`; resolve block names for the record CSVs by joining `field_id → fields.name`.

```ts
import { createAdminClient } from '@/lib/supabase/admin'
// @ts-expect-error - jszip 2.x ships no types
import JSZip from 'jszip'
import {
  buildFieldsShapefileSet,
  buildFieldsGeoJSON,
  harvestsCsv,
  spraysCsv,
  scoutingCsv,
} from '@/lib/farm-export'

const BUCKET = 'farm-snapshots'

export type FarmSnapshotRow = {
  id: string; org_id: string; period: string; trigger: 'auto' | 'manual'
  storage_path: string; file_size: number | null; block_count: number
  acreage: number; harvest_count: number; spray_count: number; created_at: string
}

function monthStart(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export async function generateFarmSnapshot(
  orgId: string,
  trigger: 'auto' | 'manual',
): Promise<{ id: string; skipped?: boolean }> {
  const admin = createAdminClient()
  const period = monthStart()

  if (trigger === 'auto') {
    const { data: existing } = await admin
      .from('farm_snapshots')
      .select('id')
      .eq('org_id', orgId).eq('period', period).eq('trigger', 'auto')
      .maybeSingle()
    if (existing) return { id: existing.id, skipped: true }
  }

  // org (for fsa_farm_number + name), fields, plantations, records
  const { data: org } = await admin
    .from('organizations').select('name, fsa_farm_number').eq('id', orgId).single()
  // Use the same field-list shape the app uses. listFields is a server lib that
  // reads via RLS; here we read with admin to stay service-role. Read it through
  // the fields_view so plantation_name/current_ratoon are populated.
  const { data: fields } = await admin
    .from('fields_view').select('*').eq('org_id', orgId).is('archived_at', null)
  const { data: plantations } = await admin
    .from('plantations').select('name, fsa_farm_number, fsa_tract_number').eq('org_id', orgId)

  const fieldNameById = new Map((fields ?? []).map((f) => [f.id, f.name ?? '']))
  const ids = (fields ?? []).map((f) => f.id)
  const { data: harvests } = ids.length
    ? await admin.from('harvests').select('field_id, harvest_year, tons_total, tons_per_acre, notes').in('field_id', ids)
    : { data: [] as any[] }
  const { data: sprays } = ids.length
    ? await admin.from('applications').select('field_id, applied_at, product, type, rate, unit, wind_dir, wind_speed, notes').in('field_id', ids)
    : { data: [] as any[] }
  const { data: scouting } = ids.length
    ? await admin.from('scouting_pins').select('field_id, category, note, created_at').in('field_id', ids)
    : { data: [] as any[] }

  // Build the zip
  const { shp, shx, dbf, prj, cpg } = buildFieldsShapefileSet(fields ?? [], plantations ?? [], org ?? { fsa_farm_number: null })
  const zip = new JSZip()
  zip.file('blocks/blocks.shp', shp)
  zip.file('blocks/blocks.shx', shx)
  zip.file('blocks/blocks.dbf', dbf)
  zip.file('blocks/blocks.prj', prj)
  zip.file('blocks/blocks.cpg', cpg)
  zip.file('blocks.geojson', buildFieldsGeoJSON(fields ?? []))
  zip.file('harvests.csv', harvestsCsv((harvests ?? []).map((h) => ({ block: fieldNameById.get(h.field_id) ?? '', harvest_year: h.harvest_year, tons_total: h.tons_total, tons_per_acre: h.tons_per_acre, notes: h.notes }))))
  zip.file('sprays.csv', spraysCsv((sprays ?? []).map((s) => ({ block: fieldNameById.get(s.field_id) ?? '', applied_at: s.applied_at, product: s.product, type: s.type, rate: s.rate, unit: s.unit, wind_dir: s.wind_dir, wind_speed: s.wind_speed, notes: s.notes }))))
  zip.file('scouting.csv', scoutingCsv((scouting ?? []).map((p) => ({ block: fieldNameById.get(p.field_id) ?? '', category: p.category, note: p.note, created_at: p.created_at }))))
  const acreage = (fields ?? []).reduce((s, f) => s + Number(f.acreage_cached || 0), 0)
  zip.file('README.txt', `${org?.name ?? 'Farm'} — Headland snapshot ${period}\nBlocks: ${(fields ?? []).length}\nAcres: ${acreage.toFixed(2)}\nHarvest records: ${(harvests ?? []).length}\nSpray records: ${(sprays ?? []).length}\n`)
  const buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer

  // Upload
  const storage_path = `${orgId}/${trigger === 'auto' ? period.slice(0, 7) : `${period.slice(0, 7)}-manual-${Date.now()}`}.zip`
  const { error: upErr } = await admin.storage.from(BUCKET).upload(storage_path, buffer, { contentType: 'application/zip', upsert: true })
  if (upErr) throw new Error(`snapshot upload failed: ${upErr.message}`)

  const { data: row, error: insErr } = await admin.from('farm_snapshots').insert({
    org_id: orgId, period, trigger, storage_path,
    file_size: buffer.length, block_count: (fields ?? []).length,
    acreage: Math.round(acreage * 100) / 100,
    harvest_count: (harvests ?? []).length, spray_count: (sprays ?? []).length,
  }).select('id').single()
  if (insErr) throw new Error(`snapshot insert failed: ${insErr.message}`)
  return { id: row.id }
}

export async function listSnapshots(orgId: string): Promise<FarmSnapshotRow[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('farm_snapshots').select('*').eq('org_id', orgId).order('period', { ascending: false }).order('created_at', { ascending: false })
  return (data ?? []) as FarmSnapshotRow[]
}

export async function getSnapshot(id: string): Promise<FarmSnapshotRow | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('farm_snapshots').select('*').eq('id', id).maybeSingle()
  return (data as FarmSnapshotRow) ?? null
}
```

NOTE: confirm the `fields_view` exposes `id, name, geometry, acreage_cached, arpents_cached, variety, plant_date, current_ratoon, plantation_name, notes, archived_at` (read `supabase/migrations/0019_rename_sections_to_plantations.sql` / `0005_fields_view.sql`). If the view lacks `archived_at`, filter on the base `fields` join instead. Confirm wind column names (see Task 2 note).

- [ ] **Step 2: Integration-verify against the test org**

Create `scripts/verify-snapshot.mjs` that imports nothing TS (call the route in Task 4 instead) — OR simplest: verify by invoking the build + a transient tsx. Since there's no TS runner for libs, verify through the **manual API route in Task 4**. Mark this step done by deferring the live check to Task 4's verification.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build 2>&1 | grep -E "Compiled successfully|error TS"`
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/snapshots.ts
git commit -m "Snapshots: generateFarmSnapshot + list/get queries

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Manual create + download routes

**Files:**
- Create: `src/app/api/snapshots/create/route.ts`
- Create: `src/app/api/snapshots/[id]/download/route.ts`

**Interfaces:**
- Consumes: `requireUserAndOrg` from `@/lib/orgs`; `generateFarmSnapshot`, `getSnapshot` from `@/lib/snapshots`; `createAdminClient` from `@/lib/supabase/admin`.
- Produces: `POST /api/snapshots/create` → `{ id }`; `GET /api/snapshots/[id]/download` → 302 redirect to a signed URL.

- [ ] **Step 1: Create route**

```ts
// src/app/api/snapshots/create/route.ts
import { NextResponse } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { getBillableAcres } from '@/lib/acreage'
import { generateFarmSnapshot } from '@/lib/snapshots'

export const runtime = 'nodejs'

export async function POST() {
  const { org } = await requireUserAndOrg()
  if ((await getBillableAcres(org.id)) < 1) {
    return NextResponse.json({ error: 'Map at least one block before creating a snapshot.' }, { status: 422 })
  }
  const res = await generateFarmSnapshot(org.id, 'manual')
  return NextResponse.json(res)
}
```

- [ ] **Step 2: Download route (org-scoped, signed URL)**

```ts
// src/app/api/snapshots/[id]/download/route.ts
import { NextResponse } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { getSnapshot } from '@/lib/snapshots'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireUserAndOrg()
  const { id } = await params
  const snap = await getSnapshot(id)
  if (!snap || snap.org_id !== org.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from('farm-snapshots').createSignedUrl(snap.storage_path, 60)
  if (error || !data) return NextResponse.json({ error: 'download_failed' }, { status: 500 })
  return NextResponse.redirect(data.signedUrl)
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build 2>&1 | grep -E "Compiled successfully|error TS"`
Expected: `Compiled successfully`.

- [ ] **Step 4: Live integration check (the real test of Task 3 + 4)**

With `npm run dev` running and the `UI Test Farm` org having ≥1 block (re-seed via `scripts/seed-ui-test-user.cjs` pattern if needed — note `pg` may be absent, use the `@supabase/supabase-js` admin client), log in via Playwright as `uitest@headlandmaps.com`, POST `/api/snapshots/create`, then assert a `farm_snapshots` row + a Storage object exist:

```bash
node --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {auth:{persistSession:false}});
(async()=>{
  const { data: org } = await a.from('organizations').select('id').eq('name','UI Test Farm').single();
  // (Invoke generateFarmSnapshot via the running dev route, or temporarily import-compile.)
  const { data: rows } = await a.from('farm_snapshots').select('*').eq('org_id', org.id).order('created_at',{ascending:false}).limit(1);
  console.log('latest snapshot row:', rows?.[0] || 'NONE');
  if (rows?.[0]) { const { data } = await a.storage.from('farm-snapshots').createSignedUrl(rows[0].storage_path, 30); console.log('signed url:', data?.signedUrl ? 'ok' : 'MISSING'); }
})();
"
```
Expected: a row with non-zero `block_count`/`acreage`/`file_size`, and `signed url: ok`. Clean up the test snapshot row + storage object afterward.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/snapshots/create/route.ts "src/app/api/snapshots/[id]/download/route.ts"
git commit -m "Snapshots: manual create + org-scoped signed-URL download routes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Monthly cron route + vercel.json

**Files:**
- Create: `src/app/api/snapshots/run/route.ts`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `createAdminClient`; `generateFarmSnapshot`. Reads `CRON_SECRET` env var.
- Produces: `GET /api/snapshots/run` (cron) → `{ created, skipped, failed }`.

- [ ] **Step 1: Cron route (secret-gated, per-org, idempotent)**

```ts
// src/app/api/snapshots/run/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateFarmSnapshot } from '@/lib/snapshots'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  // Orgs with at least one live block.
  const { data: rows } = await admin.from('fields').select('org_id').is('archived_at', null)
  const orgIds = Array.from(new Set((rows ?? []).map((r) => r.org_id)))

  let created = 0, skipped = 0, failed = 0
  for (const orgId of orgIds) {
    try {
      const res = await generateFarmSnapshot(orgId, 'auto')
      res.skipped ? skipped++ : created++
    } catch (e) {
      failed++
      console.error('[snapshots/run] failed for org', orgId, e)
    }
  }
  return NextResponse.json({ created, skipped, failed, orgs: orgIds.length })
}
```

- [ ] **Step 2: `vercel.json` cron**

```json
{
  "crons": [{ "path": "/api/snapshots/run", "schedule": "0 6 1 * *" }]
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build 2>&1 | grep -E "Compiled successfully|error TS"`
Expected: `Compiled successfully`.

- [ ] **Step 4: Local cron verification**

With `npm run dev` running and `CRON_SECRET` set in the local environment file:
```bash
curl -s -H "authorization: Bearer $(grep '^CRON_SECRET=' .env.local | cut -d= -f2)" http://localhost:3000/api/snapshots/run
```
Expected: JSON like `{"created":N,"skipped":0,"failed":0,...}`. Run again → `created:0, skipped:N` (idempotent). Then delete the test rows/objects.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/snapshots/run/route.ts vercel.json
git commit -m "Snapshots: monthly Vercel cron (secret-gated, idempotent)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: "Monthly archive" UI on the Export page

**Files:**
- Modify: `src/app/app/export/page.tsx`
- Create: `src/app/app/export/SnapshotButton.tsx` (client)

**Interfaces:**
- Consumes: `listSnapshots`, `requireUserAndOrg`, `formatUSD`-style helpers as needed.
- Produces: the archive section + manual button.

- [ ] **Step 1: Client "Create snapshot now" button**

```tsx
// src/app/app/export/SnapshotButton.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { friendlyError } from '@/lib/errors'

export default function SnapshotButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  async function go() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/snapshots/create', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Snapshot failed')
      router.refresh()
    } catch (e) { setError(friendlyError(e, 'Couldn’t create the snapshot. Please try again.')) }
    finally { setLoading(false) }
  }
  return (
    <div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <button type="button" onClick={go} disabled={loading} className="btn-primary text-sm disabled:opacity-50">
        {loading ? 'Creating…' : 'Create snapshot now'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Archive section in `export/page.tsx`**

Add (read `src/app/app/export/page.tsx` first to match its layout/section style). Render `await listSnapshots(org.id)` as a dated list, each with a download link to `/api/snapshots/[id]/download`, plus `<SnapshotButton />` and an empty state. Example block to insert:

```tsx
import { listSnapshots } from '@/lib/snapshots'
import SnapshotButton from './SnapshotButton'
// ...inside the page, after the existing export sections:
const snapshots = await listSnapshots(org.id)
// ...
<section className="...">
  <h2 className="text-lg font-bold text-primary mb-1">Monthly archive</h2>
  <p className="text-sm text-gray-600 mb-4">A dated backup of your whole farm, saved automatically on the 1st of each month. Download any month, any year.</p>
  <SnapshotButton />
  {snapshots.length === 0 ? (
    <p className="mt-4 text-sm text-gray-500">Your first snapshot is created automatically on the 1st — or make one now.</p>
  ) : (
    <ul className="mt-4 divide-y divide-gray-100 border border-gray-100 rounded-lg">
      {snapshots.map((s) => (
        <li key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
          <span><span className="font-semibold text-primary">{new Date(s.period).toLocaleDateString('en-US',{month:'long',year:'numeric'})}</span><span className="text-gray-500"> · {s.block_count} blocks · {Number(s.acreage).toLocaleString()} ac</span></span>
          <a href={`/api/snapshots/${s.id}/download`} className="font-semibold text-primary hover:underline">Download</a>
        </li>
      ))}
    </ul>
  )}
</section>
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build 2>&1 | grep -E "Compiled successfully|error TS"`
Expected: `Compiled successfully`.

- [ ] **Step 4: Visual check at 390 / 810 / 1440**

With `npm run dev` running, screenshot `/app/export` for the `UI Test Farm` (logged in via the Playwright harness, pattern: `scripts/_shot-billing.mjs`) at the three widths; confirm the archive section + button render and the list is readable. Delete the throwaway screenshot script after.

- [ ] **Step 5: Commit**

```bash
git add "src/app/app/export/page.tsx" "src/app/app/export/SnapshotButton.tsx"
git commit -m "Snapshots: Monthly archive UI on the export page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Infra setup (do once, at deploy — not a code task)

- **`CRON_SECRET`** environment variable: add a long random value in Vercel (Production) AND the local environment file. Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on cron invocations.
- The **`farm-snapshots` bucket** is created by migration 0024; confirm it exists in the Supabase dashboard after the migration runs in production.
- After deploy, verify the cron is registered (Vercel → Project → Settings → Cron Jobs) and run it once manually to seed the first snapshots.

## Self-Review

- **Spec coverage:** table+RLS (T1), private bucket (T1), generation w/ shapefile+geojson+csv+README (T2,T3), shared lib refactor (T2), auto cron + secret + idempotent (T5), manual button (T4,T6), org-scoped signed download (T4), archive UI (T6), scale note (cron `maxDuration`, documented batching deferral in spec). ✓
- **Placeholder scan:** the two `NOTE:` callouts (wind column names; `fields_view` columns) are explicit "read this file and match" instructions, not vague TODOs — acceptable because exact names must be confirmed against the live schema. No other placeholders.
- **Type consistency:** `buildFieldsShapefileSet`/`buildFieldsGeoJSON`/`*Csv` names + the `*ExportRow` types are used identically across T2→T3; `FarmSnapshotRow` shape matches the T1 columns; route↔lib function names (`generateFarmSnapshot`, `getSnapshot`, `listSnapshots`) consistent. ✓
