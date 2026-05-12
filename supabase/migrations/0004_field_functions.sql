-- Headland — server-side field create/update with PostGIS area computation.
-- Source-of-truth acreage is computed from the geography on the server,
-- never from client math. Results cached in fields.acreage_cached / arpents_cached.

-- 1 sq meter = 0.000247105 acres
-- 1 LA arpent ≈ 0.84628 acres → arpents = acres / 0.84628

create or replace function create_field(
  p_org_id uuid,
  p_name text,
  p_geojson jsonb
) returns fields
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_geom geography;
  v_acres numeric;
  v_arpents numeric;
  v_field fields;
begin
  v_geom := ST_GeomFromGeoJSON(p_geojson::text)::geography;
  v_acres := round((ST_Area(v_geom) * 0.000247105)::numeric, 2);
  v_arpents := round((v_acres / 0.84628)::numeric, 2);

  insert into fields (org_id, name, geometry, acreage_cached, arpents_cached)
  values (p_org_id, p_name, v_geom, v_acres, v_arpents)
  returning * into v_field;

  return v_field;
end;
$$;

create or replace function update_field_geometry(
  p_field_id uuid,
  p_geojson jsonb
) returns fields
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_geom geography;
  v_acres numeric;
  v_arpents numeric;
  v_field fields;
begin
  v_geom := ST_GeomFromGeoJSON(p_geojson::text)::geography;
  v_acres := round((ST_Area(v_geom) * 0.000247105)::numeric, 2);
  v_arpents := round((v_acres / 0.84628)::numeric, 2);

  update fields
    set geometry = v_geom,
        acreage_cached = v_acres,
        arpents_cached = v_arpents
    where id = p_field_id
    returning * into v_field;

  return v_field;
end;
$$;

-- Bulk import (for Farm Works shapefile): inserts many fields in one round-trip.
-- Input: array of (name, geojson) pairs. RLS still applies via is_org_member.
create or replace function bulk_create_fields(
  p_org_id uuid,
  p_features jsonb  -- [{name, geometry}, ...]
) returns setof fields
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_feat jsonb;
  v_geom geography;
  v_acres numeric;
  v_arpents numeric;
begin
  for v_feat in select * from jsonb_array_elements(p_features) loop
    v_geom := ST_GeomFromGeoJSON((v_feat->'geometry')::text)::geography;
    v_acres := round((ST_Area(v_geom) * 0.000247105)::numeric, 2);
    v_arpents := round((v_acres / 0.84628)::numeric, 2);

    return query
      insert into fields (org_id, name, geometry, acreage_cached, arpents_cached)
      values (p_org_id, coalesce(v_feat->>'name', 'Untitled'), v_geom, v_acres, v_arpents)
      returning fields.*;
  end loop;
end;
$$;
