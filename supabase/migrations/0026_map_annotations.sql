-- Hand-drawn map annotations: reference lines (roads, ditches, headland runs)
-- and text labels ("Hwy 308", "Shop house", a big "N" for north). Farm-wide —
-- they show on the live map and print on the plat/spray sheets, giving pilots
-- and crews the same reference points growers pencil onto paper maps.

create table map_annotations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  kind text not null check (kind in ('line', 'text')),
  -- GeoJSON LineString (line) or Point (text). jsonb: no PostGIS ops needed.
  geometry jsonb not null,
  -- The label content for kind='text'.
  text text,
  color text not null default '#111827' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index on map_annotations (org_id);

alter table map_annotations enable row level security;

create policy "map_annotations scoped" on map_annotations
  for all using (is_org_member(org_id))
  with check (is_org_member(org_id));
