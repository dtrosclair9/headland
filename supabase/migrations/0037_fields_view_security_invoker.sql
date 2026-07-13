-- SECURITY FIX (critical): fields_view was recreated in 0019 without
-- security_invoker, so it ran as its owner and BYPASSED the row-level
-- security on `fields` — any authenticated user could read every org's
-- blocks through the view. Restore security_invoker so the view enforces
-- the caller's RLS, and FORCE row security on the base table as
-- defense-in-depth (so even an owner-context query is still filtered).
create or replace view public.fields_view
with (security_invoker = true) as
 SELECT f.id,
    f.org_id,
    f.name,
    st_asgeojson(f.geometry::geometry)::jsonb AS geometry,
    st_x(f.centroid::geometry) AS centroid_lng,
    st_y(f.centroid::geometry) AS centroid_lat,
    f.acreage_cached,
    f.arpents_cached,
    f.variety,
    f.plant_date,
    f.current_ratoon,
    f.notes,
    f.plantation_id,
    p.name AS plantation_name,
    f.archived_at,
    f.created_at
   FROM fields f
     LEFT JOIN plantations p ON p.id = f.plantation_id;

alter table public.fields force row level security;
