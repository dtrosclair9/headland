# Headland

Field mapping & records for sugarcane growers. Built on Next.js 15, Supabase (Postgres + PostGIS), and Mapbox. Replaces the Base44 prototype at `simple-cane-map.base44.app/FarmMap`.

## Local development

```bash
cp .env.local.example .env.local      # fill in Supabase + Mapbox keys
npm install
npm run dev                           # http://localhost:3000
```

## Stack

- Next.js 15 App Router · TypeScript · Tailwind
- Supabase (Postgres + PostGIS + Auth + Storage)
- Mapbox GL JS + `@mapbox/mapbox-gl-draw` + `@turf/turf`
- Open-Meteo (weather), Sentinel Hub (NDVI)
- Vercel auto-deploy from `main`

## Routes

| Path | Purpose |
|---|---|
| `/` | Marketing landing |
| `/services/sugarcane-field-mapping-[parish]-louisiana` | Parish landing pages |
| `/login`, `/signup`, `/invite/[token]` | Auth |
| `/app/map` | Authed — main map view |
| `/app/fields/[id]` | Authed — field detail |
| `/app/team`, `/app/settings`, `/app/export` | Authed |

## Data model

See `supabase/migrations/0001_init.sql`. Multi-tenant; every table scoped via `organizations` + `memberships` with RLS. `fields.geometry` is `geography(POLYGON, 4326)` for accurate acreage via `ST_Area`.

## Build phases

See `~/.claude/plans/optimized-swimming-dove.md` for the full plan. Currently on **Phase 1 — Scaffold**.
