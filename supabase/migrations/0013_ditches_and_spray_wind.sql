-- Headland — ditches (drawable lines) + spray wind logging.
--
-- (1) Ditches are thin line features the grower draws between/around blocks
-- (see his FarmWorks crop maps). They carry no acreage math, so geometry is
-- stored as GeoJSON jsonb (a LineString) rather than PostGIS geography —
-- simpler insert/read, and we never need spatial queries on them.
--
-- (2) Spray applications need a wind record for drift/compliance. Adds wind
-- direction (8-point compass, stored as text) and optional speed to the
-- existing applications (operations) log.

create table ditches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  geometry jsonb not null,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index on ditches (org_id) where archived_at is null;

alter table ditches enable row level security;
create policy "ditches scoped" on ditches
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

alter table applications
  add column wind_direction text,
  add column wind_speed_mph numeric(5, 1);
