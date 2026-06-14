-- Reposition feature: rigidly move/rotate a group of blocks, then save all their
-- new geometries in one round-trip. Acreage is recomputed server-side (a rigid
-- move/rotate preserves area, but we keep the cache exact). RLS still applies via
-- the fields update policy (security invoker), so a user can only move their own.

create or replace function bulk_update_field_geometries(
  p_features jsonb  -- [{ id, geometry (GeoJSON Polygon) }]
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_feat jsonb;
  v_geom geography;
  v_acres numeric;
  v_arpents numeric;
  v_count integer := 0;
begin
  for v_feat in select * from jsonb_array_elements(p_features) loop
    v_geom := ST_GeomFromGeoJSON((v_feat->'geometry')::text)::geography;
    v_acres := round((ST_Area(v_geom) * 0.000247105)::numeric, 2);
    v_arpents := round((v_acres / 0.84628)::numeric, 2);

    update fields
       set geometry = v_geom,
           acreage_cached = v_acres,
           arpents_cached = v_arpents
     where id = (v_feat->>'id')::uuid;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
