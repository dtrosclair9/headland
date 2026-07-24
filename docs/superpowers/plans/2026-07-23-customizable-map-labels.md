# Customizable Map Labels + Color-By Defaults — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let growers choose which of the four block labels (Block ID / Variety / Cycle / Acres) and which color-by mode (Year cane vs Variety) show on the **live map**, with per-device-sticky live toggles seeded from a **shared org default** that is editable from the map (one "Save as default" pill) and from Settings; print keeps reading the same default.

**Architecture:** The four facts already render on both maps (FieldMap = four Mapbox symbol layers sharing one source; LiteMap = one combined permanent tooltip per block). We make that set toggleable by threading a `labelFields` set into both maps and toggling layer visibility / rebuilding the tooltip string. `MapShell` owns the live `{labelFields, colorBy}` view, initialized via a pure `resolveMapView(localStorage, orgDefault)` resolver and persisted to `localStorage`. The shared default lives on `organizations` (rename `print_label_fields → label_fields`, add `default_color_by` + `view_defaults_updated_at`) and is written by one endpoint used by both the map pill and Settings.

**Tech Stack:** Next.js 15 App Router (TypeScript), Supabase (Postgres, numbered SQL migrations applied directly), Mapbox GL (FieldMap), Leaflet (LiteMap), Tailwind.

## Global Constraints

- **No unit-test runner exists** (no vitest/jest). Verify via `npm run typecheck`, `npm run lint`, the Playwright `npm run ui:check` harness, and manual browser checks at **390 / 810 / 1440** widths. Do NOT add a test framework.
- **LiteMap must be EXACT parity** with FieldMap — same fields shown/hidden, same behavior. Replicate, never redesign. Verify Lite via `?lite=1` at all three widths.
- **Deploy discipline:** migration and code ship **together** (a renamed column read by old code 500s). Batch the deploy to the **evening** — growers are on the map during the day. `push` to `main` = Vercel deploy; do not push mid-day.
- **Column facts:** `label_fields` is `text[] not null default '{name,variety,cut,acres}'`; `default_color_by text not null default 'stage'`; `view_defaults_updated_at timestamptz not null default now()`.
- **Field → layer map (FieldMap):** `name`→`field-label-id`, `variety`→`field-label-variety`, `acres`→`field-label-acres`, `cut`→`fields-label`.
- **localStorage key:** `headland-map-view`, shape `{ labelFields: LabelField[], colorBy: 'stage'|'variety', basedOn: string }`. Absent key = use org default; empty `labelFields: []` = explicit "no labels".
- **Save default requires ≥1 label** (endpoint enforces `min(1)`); the live map still allows zero locally.
- Do NOT touch the click-popup info cards (LiteMap 328–349, FieldMap `openFieldInfo`) — they intentionally show all facts on demand.

---

### Task 1: Pure view resolver + constants in `label-fields.ts`

**Files:**
- Modify: `src/lib/label-fields.ts`

**Interfaces:**
- Produces: `MAP_VIEW_KEY: string`; `type MapView = { labelFields: LabelField[]; colorBy: 'stage'|'variety' }`; `type ViewDefaults = MapView & { updatedAt: string }`; `resolveMapView(localRaw: string | null, def: ViewDefaults): MapView`.

- [ ] **Step 1: Append the resolver + constants to `label-fields.ts`**

Add at the end of `src/lib/label-fields.ts`:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Sanity-check the resolver logic in a node REPL** (not committed)

Run:
```bash
node -e "
const ALL=['name','variety','cut','acres'];
function resolve(raw,def){if(raw){try{const p=JSON.parse(raw);if(p&&p.basedOn===def.updatedAt){const lf=(Array.isArray(p.labelFields)?p.labelFields:[]).filter(s=>ALL.includes(s));return{labelFields:lf,colorBy:p.colorBy==='variety'?'variety':'stage'}}}catch{}}return{labelFields:def.labelFields,colorBy:def.colorBy}}
const def={labelFields:['name','variety','cut','acres'],colorBy:'stage',updatedAt:'T1'};
console.log('absent →', JSON.stringify(resolve(null,def)));                                   // default
console.log('match →', JSON.stringify(resolve(JSON.stringify({labelFields:['name'],colorBy:'variety',basedOn:'T1'}),def))); // {['name'],variety}
console.log('empty(match) →', JSON.stringify(resolve(JSON.stringify({labelFields:[],colorBy:'stage',basedOn:'T1'}),def)));   // {[] , stage}
console.log('stale →', JSON.stringify(resolve(JSON.stringify({labelFields:['acres'],colorBy:'stage',basedOn:'T0'}),def)));   // default
console.log('malformed →', JSON.stringify(resolve('{bad',def)));                              // default
"
```
Expected:
```
absent → {"labelFields":["name","variety","cut","acres"],"colorBy":"stage"}
match → {"labelFields":["name"],"colorBy":"variety"}
empty(match) → {"labelFields":[],"colorBy":"stage"}
stale → {"labelFields":["name","variety","cut","acres"],"colorBy":"stage"}
malformed → {"labelFields":["name","variety","cut","acres"],"colorBy":"stage"}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/label-fields.ts
git commit -m "feat: add resolveMapView + MAP_VIEW_KEY for map label defaults"
```

---

### Task 2: Migration + rename all readers + extend the save endpoint

Renaming the column breaks every reader at once, so the migration, the seven print-page reads, the API route, and the print SaveDefaultsButton all change in this one task to keep the build green.

**Files:**
- Create: `supabase/migrations/0046_view_defaults.sql`
- Rename: `src/app/api/print-prefs/route.ts` → `src/app/api/view-defaults/route.ts`
- Modify: `src/components/print/SaveDefaultsButton.tsx`
- Modify (column read `org.print_label_fields` → `org.label_fields`): `src/app/blocks/print/page.tsx:137`, `src/app/plan-groups/[id]/print/page.tsx:60`, `src/app/operations/events/[id]/print/page.tsx:88`, `src/app/plantations/[id]/print/page.tsx:36`, `src/app/fly-plans/[id]/print/page.tsx:48` (and any other `org.print_label_fields` hit — grep in Step 2).

**Interfaces:**
- Produces: `POST /api/view-defaults` accepting `{ fields: LabelField[] (1–4), colorBy?: 'stage'|'variety', paper?: 'letter'|'legal'|'tabloid' }`, returning `{ ok: true, updatedAt: string }`. Writes `organizations.label_fields`, optionally `default_color_by`/`print_paper`, always bumps `view_defaults_updated_at`.

- [ ] **Step 1: Confirm nothing else references the old column name in SQL (views/policies)**

Run: `grep -rn "print_label_fields" supabase/migrations`
Expected: only the definition in `0030_print_label_prefs.sql`. If a view/policy references it, add its redefinition to the migration in Step 3.

- [ ] **Step 2: List every code reader of the old column**

Run: `grep -rn "print_label_fields" src`
Expected: the print pages listed above. Record the exact set — every one gets renamed in Step 6.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0046_view_defaults.sql`:

```sql
-- Map labels + color-by become a customizable, per-device-sticky live-map view
-- with a SHARED org default (2026-07-23). The label default used to be
-- print-only (print_label_fields); it now drives the live map too, so it's
-- renamed to label_fields and gains a color-by default plus a version stamp.
-- view_defaults_updated_at is bumped on every "save as default" and is how a
-- freshly-saved default propagates across one user's devices (see resolveMapView).
alter table organizations rename column print_label_fields to label_fields;

alter table organizations
  add column default_color_by text not null default 'stage'
    check (default_color_by in ('stage', 'variety'));

alter table organizations
  add column view_defaults_updated_at timestamptz not null default now();
```

- [ ] **Step 4: Apply the migration directly to Supabase**

This repo has no migration CLI — apply the SQL directly (Supabase SQL editor or `psql`), the same way `0045` was applied. **Dayne runs this** (works the DB directly). Then verify:

Run (or Supabase SQL editor):
```sql
select column_name, data_type
from information_schema.columns
where table_name = 'organizations'
  and column_name in ('label_fields', 'default_color_by', 'view_defaults_updated_at');
```
Expected: three rows; **no** `print_label_fields` row remains.

- [ ] **Step 5: Rename + extend the API route**

`git mv src/app/api/print-prefs src/app/api/view-defaults`, then replace `src/app/api/view-defaults/route.ts` with:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'
import { ALL_LABEL_FIELDS } from '@/lib/label-fields'

const Schema = z.object({
  fields: z
    .array(z.enum(ALL_LABEL_FIELDS as [string, ...string[]]))
    .min(1)
    .max(4),
  colorBy: z.enum(['stage', 'variety']).optional(),
  /** farm default paper size, saved alongside the label picks (print) */
  paper: z.enum(['letter', 'legal', 'tabloid']).optional(),
})

// Save the farm's default map/print label fields (+ optional color-by, paper).
// Bumps view_defaults_updated_at so the new default supersedes older per-device
// overrides on next load.
export async function POST(request: NextRequest) {
  const { org } = await requireUserAndOrg()
  const body = await request.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const updatedAt = new Date().toISOString()
  const supabase = await createClient()
  const { error } = await supabase
    .from('organizations')
    .update({
      label_fields: parsed.data.fields,
      ...(parsed.data.colorBy ? { default_color_by: parsed.data.colorBy } : {}),
      ...(parsed.data.paper ? { print_paper: parsed.data.paper } : {}),
      view_defaults_updated_at: updatedAt,
    })
    .eq('id', org.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, updatedAt })
}
```

- [ ] **Step 6: Update the print SaveDefaultsButton endpoint**

In `src/components/print/SaveDefaultsButton.tsx`, change the fetch path `'/api/print-prefs'` → `'/api/view-defaults'` (leave its body shape as-is; `colorBy` is optional).

- [ ] **Step 7: Rename the column read in every print page**

In each file from Step 2, change `org.print_label_fields` → `org.label_fields` (the surrounding `parseLabelFields(...)` call is unchanged). Example — `src/app/blocks/print/page.tsx:137`:

```ts
    parseLabelFields(org.label_fields as LabelField[] | undefined),
```

- [ ] **Step 8: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. Grep confirms zero readers left:
Run: `grep -rn "print_label_fields\|api/print-prefs" src`
Expected: no matches.

- [ ] **Step 9: Manual check — print still works**

Start dev (`npm run dev`), open a print route (e.g. `/blocks/print`), toggle label fields, "Save as default", reload → the saved set persists. (Confirms the renamed column + endpoint.)

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0046_view_defaults.sql src/app/api/view-defaults src/components/print/SaveDefaultsButton.tsx src/app/blocks/print/page.tsx src/app/plan-groups src/app/operations/events src/app/plantations src/app/fly-plans
git commit -m "feat: rename print_label_fields->label_fields, add color-by default + version stamp; /api/view-defaults"
```

---

### Task 3: FieldMap — toggle the four label layers

**Files:**
- Modify: `src/components/map/FieldMap.tsx` (props ~190/266; new ref + effect; gate the reposition restore at 1934)

**Interfaces:**
- Consumes: `LabelField` from `@/lib/label-fields`.
- Produces: `FieldMapProps.labelFields?: ReadonlySet<LabelField>` (optional; when absent, all four show — preserves standalone behavior).

- [ ] **Step 1: Import the type + add the prop**

At the top imports of `FieldMap.tsx`, add `LabelField` to the existing `@/lib/label-fields` import (or add a new import):

```ts
import { ALL_LABEL_FIELDS, type LabelField } from '@/lib/label-fields'
```

In `interface FieldMapProps` (line 190), add:

```ts
  /** which of the 4 facts to render; absent = all four (standalone default) */
  labelFields?: ReadonlySet<LabelField>
```

In the `export default function FieldMap({ … })` destructure (line 266), add `labelFields,` to the parameter list.

- [ ] **Step 2: Add a ref that mirrors labelFields (so non-label effects read it without re-triggering)**

Near the other refs (e.g. by `viewModeRef`, ~line 1727), add a ref and keep it synced. First, at component top with the other `useRef`s:

```ts
const labelFieldsRef = useRef<ReadonlySet<LabelField>>(labelFields ?? new Set(ALL_LABEL_FIELDS))
```

Then an effect to keep it current + drive layer visibility (place after the white-sheet effect, ~after line 1722):

```ts
// Per-field label visibility (user toggle). The 4 label layers are in the
// white-sheet `ours` set (they aren't hidden by the crop-sheet loop), so this
// effect owns their base visibility. cut=fields-label (center), name/variety/
// acres = the three corner layers.
useEffect(() => {
  const set = labelFields ?? new Set<LabelField>(ALL_LABEL_FIELDS)
  labelFieldsRef.current = set
  const map = mapRef.current
  if (!map || !ready) return
  const pairs: [LabelField, string][] = [
    ['cut', 'fields-label'],
    ['name', 'field-label-id'],
    ['variety', 'field-label-variety'],
    ['acres', 'field-label-acres'],
  ]
  for (const [field, layerId] of pairs) {
    try {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', set.has(field) ? 'visible' : 'none')
      }
    } catch {
      /* layer not ready — ignore */
    }
  }
}, [labelFields, ready])
```

- [ ] **Step 3: Gate the reposition restore so a toggled-off cut label doesn't reappear**

At `FieldMap.tsx:1934`, replace the hardcoded restore:

```ts
        map.setLayoutProperty('fields-label', 'visibility', 'visible')
```

with:

```ts
        map.setLayoutProperty(
          'fields-label',
          'visibility',
          labelFieldsRef.current.has('cut') ? 'visible' : 'none',
        )
```

(Leave line 1793's `'none'` as-is — hiding during a move is always safe.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/map/FieldMap.tsx
git commit -m "feat: FieldMap honors a labelFields set to toggle the 4 label layers"
```

---

### Task 4: LiteMap — EXACT label parity

LiteMap renders the four facts as **one** permanent center tooltip (`<strong>{name}</strong>` + a `factsFor` sub-line of `acres · variety · cut`). Thread `labelFields` through `factsFor`, `contentFor`, the collision-box sizing, and the effect deps; bind no tooltip when the visible set is empty.

**Files:**
- Modify: `src/components/map/LiteMap.tsx` (props ~46/90; label effect 401–492)

**Interfaces:**
- Consumes: `LabelField` from `@/lib/label-fields`.
- Produces: `labelFields?: ReadonlySet<LabelField>` prop (absent = all four).

- [ ] **Step 1: Import the type + add the prop**

Add import:

```ts
import { ALL_LABEL_FIELDS, type LabelField } from '@/lib/label-fields'
```

Add to the props type (near line 90, beside `colorBy?`):

```ts
  labelFields?: ReadonlySet<LabelField>
```

Add `labelFields` to the destructured params (near line 46). It is used inside the label effect below.

- [ ] **Step 2: Thread labelFields into `factsFor` and `contentFor`** (LiteMap.tsx 418–435)

Replace the `factsFor`/`contentFor` definitions with:

```ts
    const lf = labelFields ?? new Set<LabelField>(ALL_LABEL_FIELDS)
    const factsFor = (f: FieldRow) =>
      [
        lf.has('acres') && Number(f.acreage_cached || 0)
          ? `${Number(f.acreage_cached).toFixed(2)} ac`
          : '',
        lf.has('variety') ? (f.variety ?? '') : '',
        lf.has('cut') && f.current_ratoon ? (cutShort[f.current_ratoon] ?? '') : '',
      ]
        .filter(Boolean)
        .join(' · ')
    const contentFor = (f: FieldRow) => {
      const facts = factsFor(f)
      const nameShown = lf.has('name')
      if (!nameShown && !facts) return ''
      // Same label rule as the full map: white text with a dark halo on
      // colored blocks, black with a white halo on white/plain blocks.
      const colored = fillFor(f) !== '#FFFFFF'
      const textStyle = colored
        ? 'color:#FFFFFF;text-shadow:0 0 3px #0F2A1F,0 0 3px #0F2A1F'
        : 'color:#111827;text-shadow:0 0 2px #FFFFFF,0 0 2px #FFFFFF'
      const head = nameShown ? `<strong>${escapeHtml(f.name)}</strong>` : ''
      const sub = facts
        ? `${nameShown ? '<br/>' : ''}<span style="font-weight:500;font-size:10px">${escapeHtml(facts)}</span>`
        : ''
      return `<div style="text-align:center;${textStyle}">${head}${sub}</div>`
    }
```

- [ ] **Step 3: Size collision boxes off the visible content** (LiteMap.tsx ~459–466)

Inside the candidate/box loop, replace the `w`/`h` computation:

```ts
      const facts = factsFor(f)
      const nameShown = lf.has('name')
      const nameW = nameShown ? (f.name ?? '').length * 8 : 0
      const w = Math.max(nameW, facts.length * 5.5) + 20
      const h = (nameShown && facts ? 44 : nameShown || facts ? 30 : 0) + 4
```

- [ ] **Step 4: Skip labeling entirely when the set is empty** (LiteMap.tsx ~441)

Change the candidate-gathering guard from `if (showLabels) {` to:

```ts
    if (showLabels && lf.size > 0) {
```

(With no candidates, the existing bind loop unbinds every tooltip — a clean "no labels" map.)

- [ ] **Step 5: Add `labelFields` to the effect dependency array** (LiteMap.tsx 492)

Append `labelFields` to the deps array of the label effect:

```ts
  }, [fields, mode, viewTick, repositionIds, colorBy, varietyColors, stageColorMap, filterIds, whiteMap, highlightColor, blockColors, selectedFieldId, labelFields])
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/map/LiteMap.tsx
git commit -m "feat: LiteMap honors labelFields for exact label parity with FieldMap"
```

---

### Task 5: LayersPanel — Labels section + Save/Reset (directly under the Color-by divider)

**Files:**
- Modify: `src/components/map/LayersPanel.tsx` (props ~31/50; render — insert Labels above the Color-by row at 214, Save/Reset right after it at 241)

**Interfaces:**
- Consumes: `LABEL_FIELD_NAMES`, `ALL_LABEL_FIELDS`, `LabelField` from `@/lib/label-fields`.
- Produces (new optional props, so this task is green before MapShell wires them in Task 6):
  - `labelFields?: ReadonlySet<LabelField>` (default: all four)
  - `onLabelFieldsChange?: (next: Set<LabelField>) => void`
  - `onSaveViewDefault?: () => void`
  - `onResetViewDefault?: () => void`
  - `savingViewDefault?: boolean`

- [ ] **Step 1: Import + add props**

Add import:

```ts
import { ALL_LABEL_FIELDS, LABEL_FIELD_NAMES, type LabelField } from '@/lib/label-fields'
```

Add to the props type (~line 50) and destructure (~line 31):

```ts
  labelFields?: ReadonlySet<LabelField>
  onLabelFieldsChange?: (next: Set<LabelField>) => void
  onSaveViewDefault?: () => void
  onResetViewDefault?: () => void
  savingViewDefault?: boolean
```

- [ ] **Step 2: Insert the Labels section directly ABOVE the "Color by" row**

Immediately before the `{/* Color by … */}` block (before line 210), insert:

```tsx
      {/* Labels — which of the 4 block facts render on the map. Sits directly
          above Color by so the Save pill below the divider clearly caps both. */}
      <div className="px-4 py-2.5 border-b border-gray-100">
        <span className="text-[11px] uppercase tracking-wider font-bold text-gray-600">
          Labels
        </span>
        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5">
          {ALL_LABEL_FIELDS.map((f) => {
            const on = (labelFields ?? new Set<LabelField>(ALL_LABEL_FIELDS)).has(f)
            return (
              <label key={f} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => {
                    const next = new Set<LabelField>(labelFields ?? new Set(ALL_LABEL_FIELDS))
                    next.has(f) ? next.delete(f) : next.add(f)
                    onLabelFieldsChange?.(next)
                  }}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                />
                {LABEL_FIELD_NAMES[f]}
              </label>
            )
          })}
        </div>
      </div>
```

- [ ] **Step 3: Insert the Save pill + Reset link directly UNDER the Color-by divider**

Immediately after the Color-by block's closing (after line 241, i.e. after the `)}` that closes the `{Object.keys(varietyColors).length > 0 && ( … )}`), insert — **outside** that conditional so it always renders:

```tsx
      {/* Save-as-default: caps the Labels + Color-by group so its scope is
          obvious. Always rendered (Color by hides when an org has no varieties). */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-3">
        <button
          type="button"
          onClick={onSaveViewDefault}
          disabled={savingViewDefault || (labelFields?.size ?? ALL_LABEL_FIELDS.length) === 0}
          title={
            (labelFields?.size ?? 1) === 0 ? 'Pick at least one label to save as default' : undefined
          }
          className="flex-1 text-xs font-semibold rounded-md border-2 border-primary text-primary px-3 py-1.5 hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {savingViewDefault ? 'Saving…' : 'Save current view as default'}
        </button>
        <button
          type="button"
          onClick={onResetViewDefault}
          className="text-xs font-semibold text-gray-500 hover:text-primary shrink-0"
        >
          Reset
        </button>
      </div>
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/map/LayersPanel.tsx
git commit -m "feat: LayersPanel Labels section + Save/Reset pill under the Color-by divider"
```

---

### Task 6: MapShell — own the view, persist locally, save/reset

**Files:**
- Modify: `src/components/map/MapShell.tsx` (props ~33; state ~326; `<LayersPanel/>` ~673; `<FieldMap/>` ~770; the `<LiteMap/>` render)

**Interfaces:**
- Consumes: `resolveMapView`, `MAP_VIEW_KEY`, `ALL_LABEL_FIELDS`, `type LabelField`, `type ViewDefaults` from `@/lib/label-fields`; `ColorBy` from `./FieldMap`; LayersPanel/FieldMap/LiteMap props from Tasks 3–5.
- Produces: `MapShellProps.viewDefaults?: ViewDefaults` (optional; fallback = all four / stage / '').

- [ ] **Step 1: Import + add the prop + fallback**

Add import:

```ts
import {
  ALL_LABEL_FIELDS,
  MAP_VIEW_KEY,
  resolveMapView,
  type LabelField,
  type ViewDefaults,
} from '@/lib/label-fields'
```

In `interface MapShellProps` (line 33), add:

```ts
  viewDefaults?: ViewDefaults
```

Add `viewDefaults` to the destructured params (~line 51). Near the top of the component body add:

```ts
const savedDefaultInit: ViewDefaults = viewDefaults ?? {
  labelFields: [...ALL_LABEL_FIELDS],
  colorBy: 'stage',
  updatedAt: '',
}
```

- [ ] **Step 2: Replace the hardcoded colorBy state with the view state**

Replace `const [colorBy, setColorBy] = useState<ColorBy>('stage')` (line 326) with:

```ts
const [savedDefault, setSavedDefault] = useState<ViewDefaults>(savedDefaultInit)
const [labelFields, setLabelFields] = useState<Set<LabelField>>(new Set(savedDefaultInit.labelFields))
const [colorBy, setColorByState] = useState<ColorBy>(savedDefaultInit.colorBy)
const [savingViewDefault, setSavingViewDefault] = useState(false)

// Hydrate from localStorage AFTER mount (avoids an SSR hydration mismatch on
// the LayersPanel checkboxes — server renders the default, client corrects).
useEffect(() => {
  const v = resolveMapView(localStorage.getItem(MAP_VIEW_KEY), savedDefaultInit)
  setLabelFields(new Set(v.labelFields))
  setColorByState(v.colorBy)
  // run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])

const persistView = (fields: Set<LabelField>, cb: ColorBy) => {
  localStorage.setItem(
    MAP_VIEW_KEY,
    JSON.stringify({ labelFields: [...fields], colorBy: cb, basedOn: savedDefault.updatedAt }),
  )
}
const handleLabelFieldsChange = (next: Set<LabelField>) => {
  setLabelFields(next)
  persistView(next, colorBy)
}
const setColorBy = (cb: ColorBy) => {
  setColorByState(cb)
  persistView(labelFields, cb)
}
const handleSaveViewDefault = async () => {
  if (labelFields.size === 0) return
  setSavingViewDefault(true)
  try {
    const res = await fetch('/api/view-defaults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: [...labelFields], colorBy }),
    })
    if (res.ok) {
      const { updatedAt } = (await res.json()) as { updatedAt: string }
      setSavedDefault({ labelFields: [...labelFields], colorBy, updatedAt })
      localStorage.removeItem(MAP_VIEW_KEY) // current === default now
    }
  } finally {
    setSavingViewDefault(false)
  }
}
const handleResetViewDefault = () => {
  localStorage.removeItem(MAP_VIEW_KEY)
  setLabelFields(new Set(savedDefault.labelFields))
  setColorByState(savedDefault.colorBy)
}
```

> Note: existing code calls `setColorBy(...)`; the new `setColorBy` wrapper (persists + sets state) preserves those call sites. Do NOT rename other `setColorBy` usages. If any code sets colorBy without wanting persistence, it still persists harmlessly.

- [ ] **Step 3: Pass the label props to LayersPanel**

In the `<LayersPanel … />` render (~line 673, alongside `colorBy={colorBy}` / `onColorByChange={setColorBy}`), add:

```tsx
          labelFields={labelFields}
          onLabelFieldsChange={handleLabelFieldsChange}
          onSaveViewDefault={handleSaveViewDefault}
          onResetViewDefault={handleResetViewDefault}
          savingViewDefault={savingViewDefault}
```

- [ ] **Step 4: Pass labelFields to both maps**

In the `<FieldMap … />` render (~line 770) and the `<LiteMap … />` render, add:

```tsx
          labelFields={labelFields}
```

(Find both with `grep -n "<FieldMap\|<LiteMap" src/components/map/MapShell.tsx`.)

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/map/MapShell.tsx
git commit -m "feat: MapShell owns labelFields+colorBy view, persists per-device, save/reset default"
```

---

### Task 7: Routes — pass `viewDefaults` into MapShell

**Files:**
- Modify: `src/app/app/map/page.tsx`
- Modify: `src/app/app/snapshots/[id]/map/page.tsx` (if it renders MapShell with an org that has these columns; otherwise leave to the fallback)

**Interfaces:**
- Consumes: `parseLabelFields`, `type LabelField` from `@/lib/label-fields`; `org.label_fields`, `org.default_color_by`, `org.view_defaults_updated_at`.

- [ ] **Step 1: Thread the prop in the main map route**

In `src/app/app/map/page.tsx`, add the import:

```ts
import { parseLabelFields, type LabelField } from '@/lib/label-fields'
```

Add the prop to `<MapShell … />`:

```tsx
      viewDefaults={{
        labelFields: parseLabelFields(org.label_fields as LabelField[] | undefined),
        colorBy: (org.default_color_by as 'stage' | 'variety') ?? 'stage',
        updatedAt: String(org.view_defaults_updated_at ?? ''),
      }}
```

- [ ] **Step 2: Snapshot map route**

Open `src/app/app/snapshots/[id]/map/page.tsx`. If its `org` (from `requireUserAndOrg`) carries the columns, add the same `viewDefaults={{…}}` prop so labels honor the default there too. If it uses a snapshot-scoped org without these fields, leave it — MapShell's fallback renders all four / stage. Note the choice in the commit message.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/map/page.tsx src/app/app/snapshots/[id]/map/page.tsx
git commit -m "feat: pass org view defaults into MapShell"
```

---

### Task 8: Settings — "Map & print labels" section

**Files:**
- Create: `src/app/app/settings/MapLabelSettings.tsx` (client)
- Modify: `src/app/app/settings/page.tsx` (render the section near "Map colors", ~line 128)

**Interfaces:**
- Consumes: `ALL_LABEL_FIELDS`, `LABEL_FIELD_NAMES`, `parseLabelFields`, `type LabelField` from `@/lib/label-fields`; `POST /api/view-defaults`.

- [ ] **Step 1: Create the client component**

Create `src/app/app/settings/MapLabelSettings.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { ALL_LABEL_FIELDS, LABEL_FIELD_NAMES, type LabelField } from '@/lib/label-fields'

export default function MapLabelSettings({
  initialFields,
  initialColorBy,
}: {
  initialFields: LabelField[]
  initialColorBy: 'stage' | 'variety'
}) {
  const [fields, setFields] = useState<Set<LabelField>>(new Set(initialFields))
  const [colorBy, setColorBy] = useState<'stage' | 'variety'>(initialColorBy)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const toggle = (f: LabelField) => {
    const next = new Set(fields)
    next.has(f) ? next.delete(f) : next.add(f)
    setFields(next)
    setSaved(false)
  }

  const save = async () => {
    if (fields.size === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/view-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: [...fields], colorBy }),
      })
      if (res.ok) setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
          Labels shown on blocks
        </p>
        <div className="grid grid-cols-2 gap-2">
          {ALL_LABEL_FIELDS.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={fields.has(f)}
                onChange={() => toggle(f)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              {LABEL_FIELD_NAMES[f]}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
          Color blocks by
        </p>
        <div className="flex gap-4">
          {(
            [
              ['stage', 'Year cane'],
              ['variety', 'Variety'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="default-color-by"
                checked={colorBy === key}
                onChange={() => {
                  setColorBy(key)
                  setSaved(false)
                }}
                className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || fields.size === 0}
          className="text-sm font-semibold rounded-md border-2 border-primary text-primary px-4 py-1.5 hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save default'}
        </button>
        {fields.size === 0 && (
          <span className="text-xs text-gray-500">Pick at least one label.</span>
        )}
        {saved && <span className="text-xs text-green-600 font-medium">Saved</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Render the section in the settings page**

In `src/app/app/settings/page.tsx`, add the import:

```ts
import { parseLabelFields, type LabelField } from '@/lib/label-fields'
import MapLabelSettings from './MapLabelSettings'
```

Near the "Map colors" section (~line 128), add a sibling section:

```tsx
        <section className="mb-8">
          <h2 className="text-base font-bold text-primary mb-3">Map &amp; print labels</h2>
          <p className="text-sm text-gray-600 mb-4">
            The default facts shown on each block, and how blocks are colored. Applies to the
            live map and printed sheets; each device can still toggle its own view.
          </p>
          <MapLabelSettings
            initialFields={parseLabelFields(org.label_fields as LabelField[] | undefined)}
            initialColorBy={(org.default_color_by as 'stage' | 'variety') ?? 'stage'}
          />
        </section>
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/settings/MapLabelSettings.tsx src/app/app/settings/page.tsx
git commit -m "feat: Settings 'Map & print labels' default editor"
```

---

### Task 9: Full verification pass (3 widths, full + Lite, cross-device)

**Files:** none (verification only).

- [ ] **Step 1: Static gates**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS (a clean production build catches route/type issues).
(Do NOT run `next build` while `next dev` is running — stop dev first; a shared `.next` corrupts chunks.)

- [ ] **Step 2: UI self-test harness**

Run: `npm run ui:seed` then `npm run ui:check`
Expected: PASS at 390 / 810 / 1440 (no regressions in the seeded map/settings screens).

- [ ] **Step 3: Manual — full map (Mapbox), all three widths**

Start `npm run dev`. At 390, 810, 1440 on `/app/map`:
- Toggle each of Block ID / Variety / Cycle / Acres off then on → the matching label disappears/reappears on blocks (zoom in past ~z14 for the corner labels).
- Turn all four off → clean map, no block labels. Turn one back on → it returns.
- Switch Color by Year cane ↔ Variety → palette changes.
- "Save current view as default" → button shows Saving… then settles; reload the page → the saved set/colorBy is what renders.
- Toggle something else, then "Reset" → returns to the saved default; reload → still the saved default (local override cleared).
- Enter/exit a reposition (move a block) with Cycle toggled OFF → the center cut label does NOT reappear after exiting.

- [ ] **Step 4: Manual — Lite map parity**

Open `/app/map?lite=1` at 390 / 810 / 1440. Repeat the toggle checks:
- Each field shows/hides inside the block's combined tooltip; name-off drops the bold header; all-off → no tooltips.
- Confirm it matches the full map's visible facts for the same toggles (EXACT parity).

- [ ] **Step 5: Manual — Settings + cross-device rule**

- On `/app/settings`, "Map & print labels": change the set + color-by, "Save default" → shows Saved.
- Simulate a second device: in devtools, `localStorage.removeItem('headland-map-view')`, reload `/app/map` → it shows the newly-saved default (propagation).
- Simulate "newer local tweak wins on its own device": toggle a label on the map (writes localStorage with the current basedOn), reload → your tweak persists.

- [ ] **Step 6: Guardrail grep (no stray old references)**

Run: `grep -rn "print_label_fields\|api/print-prefs" src`
Expected: no matches.

- [ ] **Step 7: Deploy (evening only)**

Confirm the migration (Task 2 Step 4) is applied to prod Supabase, THEN push so Vercel deploys the code in the same window. Batch to the evening — growers are on the map during the day.

```bash
git push origin feat/customizable-map-labels
# open a PR into main, or fast-forward main per the usual flow, in the evening
```

---

## Self-Review

**Spec coverage:**
- Shared default (rename `print_label_fields`→`label_fields`) — Task 2. ✅
- Per-device sticky + version-tag cross-device rule — `resolveMapView` (Task 1), MapShell persist/save (Task 6). ✅
- Live-map label toggles, 4 layers via `setLayoutProperty`, compose with white-sheet/reposition — Task 3. ✅
- LiteMap exact parity — Task 4. ✅
- LayersPanel Labels above Color by, Save pill under the divider, Reset — Task 5. ✅
- MapShell ownership + routes — Tasks 6–7. ✅
- Settings "Map & print labels" (Year cane / Variety copy) — Task 8. ✅
- Zero-labels allowed live but not savable as default — LayersPanel disable (Task 5) + MapShell guard (Task 6) + endpoint `min(1)` (Task 2). ✅
- 390/810/1440, Lite via `?lite=1`, evening deploy — Task 9. ✅

**Placeholder scan:** No TBD/TODO; every code step shows real code. Snapshot-route conditional (Task 7 Step 2) is a genuine branch, not a placeholder — both outcomes specified.

**Type consistency:** `MapView`/`ViewDefaults`/`LabelField` defined in Task 1 and consumed unchanged in Tasks 3–8. `labelFields` is `ReadonlySet<LabelField>` on component props and `Set<LabelField>` in MapShell state (Set is assignable to ReadonlySet). `colorBy` is `'stage'|'variety'` (= `ColorBy`) everywhere. Endpoint returns `{ updatedAt }`, consumed in MapShell Task 6. The `setColorBy` wrapper preserves existing call sites.
