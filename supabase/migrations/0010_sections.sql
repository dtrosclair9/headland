-- Headland — Sections (grower-named field groupings) + FSA org metadata.
--
-- "Section" is the LA grower's mental model for a parent group of blocks
-- (e.g. "Rosedale" = 25 blocks). Maps cleanly onto FSA's Farm → Tract → Field.
-- The block (single polygon) is what Headland already calls a `field`.
--
-- All additions are nullable / optional so this migration is non-breaking:
-- existing fields stay unsectioned; existing orgs stay without FSA metadata;
-- nothing in the live app changes until the user starts using sections.

-- ── sections table ──────────────────────────────────────────────────

create table sections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  fsa_tract_number text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);
create index on sections (org_id) where archived_at is null;

alter table sections enable row level security;
create policy "sections scoped" on sections
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ── fields.section_id ───────────────────────────────────────────────
-- on delete set null → archiving / deleting a section unassigns its fields
-- rather than cascading, which would be a catastrophic foot-gun.

alter table fields
  add column section_id uuid references sections (id) on delete set null;
create index on fields (section_id) where section_id is not null;

-- ── organizations: FSA identifiers (optional metadata) ──────────────
-- county_fips is the 5-digit code (e.g. '22007' = Assumption Parish, LA)
-- used in FSA filename conventions like `clu_a_la007_FSA-37`.

alter table organizations
  add column fsa_farm_number text,
  add column county_fips text;

-- ── refresh fields_view to expose section_id + section_name ─────────
-- Sidebar / map / exports can group + label without a separate join.
--
-- DROP + CREATE (rather than CREATE OR REPLACE) because Postgres rejects
-- column-position changes via OR REPLACE — we're inserting section_id and
-- section_name before archived_at / created_at in the column list.

drop view if exists fields_view;
create view fields_view with (security_invoker = true) as
select
  f.id,
  f.org_id,
  f.name,
  ST_AsGeoJSON(f.geometry::geometry)::jsonb as geometry,
  ST_X(f.centroid::geometry) as centroid_lng,
  ST_Y(f.centroid::geometry) as centroid_lat,
  f.acreage_cached,
  f.arpents_cached,
  f.variety,
  f.plant_date,
  f.current_ratoon,
  f.notes,
  f.section_id,
  s.name as section_name,
  f.archived_at,
  f.created_at
from fields f
left join sections s on s.id = f.section_id;
