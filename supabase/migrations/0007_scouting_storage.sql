-- Headland — scouting storage + RPC functions.
-- Public-read bucket so we can serve photos directly without per-request signed URLs;
-- writes are gated by RLS (only org members can upload). Paths embed org_id so
-- every object's owning org is unambiguous from the path:
--   scouting-photos/{org_id}/{field_id}/{pin_id}.{ext}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scouting-photos',
  'scouting-photos',
  true,
  10485760,  -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS on storage.objects: only org members can write to their org's folder.
drop policy if exists "scouting photos: members write" on storage.objects;
create policy "scouting photos: members write" on storage.objects
  for insert
  with check (
    bucket_id = 'scouting-photos'
    and is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "scouting photos: members update" on storage.objects;
create policy "scouting photos: members update" on storage.objects
  for update
  using (
    bucket_id = 'scouting-photos'
    and is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "scouting photos: members delete" on storage.objects;
create policy "scouting photos: members delete" on storage.objects
  for delete
  using (
    bucket_id = 'scouting-photos'
    and is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- ── RPC: insert a pin given lng/lat (cleaner than crafting WKT/GeoJSON in JS). ──
create or replace function create_scouting_pin(
  p_field_id uuid,
  p_lng double precision,
  p_lat double precision,
  p_category scouting_category,
  p_note text,
  p_photo_url text
) returns scouting_pins
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pin scouting_pins;
begin
  insert into scouting_pins (field_id, geometry, category, note, photo_url, created_by)
  values (
    p_field_id,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_category,
    p_note,
    p_photo_url,
    auth.uid()
  )
  returning * into v_pin;
  return v_pin;
end;
$$;

-- ── View: pins with lng/lat split out for client rendering. ──
create or replace view scouting_pins_view with (security_invoker = true) as
select
  p.id,
  p.field_id,
  p.category,
  p.note,
  p.photo_url,
  p.created_by,
  p.created_at,
  ST_X(p.geometry::geometry) as lng,
  ST_Y(p.geometry::geometry) as lat
from scouting_pins p;

-- ── View: pins joined with field/org for cross-field listing on the map page. ──
create or replace view scouting_pins_for_org with (security_invoker = true) as
select
  p.id,
  p.field_id,
  f.org_id,
  p.category,
  p.note,
  p.photo_url,
  p.created_by,
  p.created_at,
  ST_X(p.geometry::geometry) as lng,
  ST_Y(p.geometry::geometry) as lat
from scouting_pins p
join fields f on f.id = p.field_id;
