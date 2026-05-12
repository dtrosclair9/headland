-- Headland — initial schema
-- Multi-tenant: every row scoped via organizations + memberships.
-- Geo: PostGIS for acreage, centroid, and bbox queries.

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ── enums ───────────────────────────────────────────────────────────
create type role as enum ('owner', 'member');
create type plan_tier as enum ('free', 'starter', 'pro', 'enterprise');
create type ratoon_stage as enum (
  'plant_cane',
  'first_stubble',
  'second_stubble',
  'third_stubble',
  'fourth_stubble',
  'fifth_stubble_plus',
  'fallow'
);
create type application_type as enum (
  'herbicide',
  'insecticide',
  'fungicide',
  'fertilizer',
  'ripener',
  'other'
);
create type scouting_category as enum (
  'weed_pressure',
  'insect_pressure',
  'disease',
  'lodging',
  'washout',
  'gap',
  'note',
  'other'
);

-- ── tables ──────────────────────────────────────────────────────────

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete restrict,
  plan_tier plan_tier not null default 'free',
  acre_count_cached numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table memberships (
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role role not null default 'member',
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  email text not null,
  token text not null unique,
  role role not null default 'member',
  invited_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on invitations (email);
create index on invitations (org_id);

create table fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  geometry geography(POLYGON, 4326) not null,
  centroid geography(POINT, 4326) generated always as (st_centroid(geometry)) stored,
  acreage_cached numeric(10, 2) not null,
  arpents_cached numeric(10, 2) not null,
  variety text,
  plant_date date,
  current_ratoon ratoon_stage,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index fields_geom_gix on fields using gist (geometry);
create index fields_centroid_gix on fields using gist (centroid);
create index on fields (org_id) where archived_at is null;

create table harvests (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields (id) on delete cascade,
  harvest_year int not null,
  tons_total numeric(10, 2),
  tons_per_acre numeric(10, 2),
  notes text,
  created_at timestamptz not null default now(),
  unique (field_id, harvest_year)
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields (id) on delete cascade,
  applied_at date not null,
  product text not null,
  type application_type not null,
  rate numeric(10, 3),
  unit text,
  notes text,
  applied_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on applications (field_id, applied_at desc);

create table scouting_pins (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields (id) on delete cascade,
  geometry geography(POINT, 4326) not null,
  category scouting_category not null,
  note text,
  photo_url text,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index scouting_pins_geom_gix on scouting_pins using gist (geometry);
create index on scouting_pins (field_id, created_at desc);

create table field_imagery_cache (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields (id) on delete cascade,
  captured_on date not null,
  ndvi_overlay_url text,
  ndvi_mean numeric(6, 4),
  source text not null default 'sentinel-hub',
  fetched_at timestamptz not null default now(),
  unique (field_id, captured_on, source)
);

-- ── helper: am I a member of this org? ──────────────────────────────
create or replace function is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where org_id = target_org and user_id = auth.uid() and accepted_at is not null
  );
$$;

create or replace function is_org_owner(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where org_id = target_org and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ── RLS ─────────────────────────────────────────────────────────────
alter table organizations enable row level security;
alter table memberships enable row level security;
alter table invitations enable row level security;
alter table fields enable row level security;
alter table harvests enable row level security;
alter table applications enable row level security;
alter table scouting_pins enable row level security;
alter table field_imagery_cache enable row level security;

-- organizations: members can read; owner can update; only auth-users can insert (their own).
create policy "org read for members" on organizations
  for select using (is_org_member(id));
create policy "org insert by self" on organizations
  for insert with check (owner_id = auth.uid());
create policy "org update by owner" on organizations
  for update using (is_org_owner(id));

-- memberships: a user sees their own row + rows in any org they belong to.
create policy "membership read" on memberships
  for select using (user_id = auth.uid() or is_org_member(org_id));
create policy "membership insert by owner" on memberships
  for insert with check (is_org_owner(org_id) or user_id = auth.uid());
create policy "membership update self" on memberships
  for update using (user_id = auth.uid() or is_org_owner(org_id));
create policy "membership delete by owner" on memberships
  for delete using (is_org_owner(org_id));

-- invitations: org members read, owner writes.
create policy "invitation read by member" on invitations
  for select using (is_org_member(org_id));
create policy "invitation write by owner" on invitations
  for all using (is_org_owner(org_id)) with check (is_org_owner(org_id));

-- fields + child tables: scoped via memberships.
create policy "fields scoped" on fields
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

create policy "harvests scoped" on harvests
  for all using (is_org_member((select org_id from fields where id = field_id)))
  with check (is_org_member((select org_id from fields where id = field_id)));

create policy "applications scoped" on applications
  for all using (is_org_member((select org_id from fields where id = field_id)))
  with check (is_org_member((select org_id from fields where id = field_id)));

create policy "scouting scoped" on scouting_pins
  for all using (is_org_member((select org_id from fields where id = field_id)))
  with check (is_org_member((select org_id from fields where id = field_id)));

create policy "imagery scoped" on field_imagery_cache
  for all using (is_org_member((select org_id from fields where id = field_id)))
  with check (is_org_member((select org_id from fields where id = field_id)));
