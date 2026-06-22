-- Durability for corrected acreage: bulk_update_field_geometries is only used by
-- the reposition (move/rotate) tool, which is a RIGID transform — area never
-- changes. Recomputing acreage from the geometry there would clobber a grower's
-- stated/FSA acreage with the (often rougher) polygon area. So preserve the
-- cached acreage and only move the geometry.

create or replace function public.bulk_update_field_geometries(p_features jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_feat jsonb;
  v_geom geography;
  v_count integer := 0;
begin
  for v_feat in select * from jsonb_array_elements(p_features) loop
    v_geom := ST_GeomFromGeoJSON((v_feat->'geometry')::text)::geography;
    -- Geometry only; acreage_cached / arpents_cached are preserved (rigid move).
    update fields
       set geometry = v_geom
     where id = (v_feat->>'id')::uuid;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
