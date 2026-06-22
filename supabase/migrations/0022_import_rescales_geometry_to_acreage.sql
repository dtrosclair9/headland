-- Make imports come out with correct SIZES, not just correct acreage numbers.
-- Source polygons (e.g. FarmWorks) are routinely the wrong size. When an acreage
-- column is mapped, rescale each polygon about its own centroid so its true area
-- matches the stated acreage. This keeps the block's position (centroid) and
-- fixes its size + makes acreage_cached exact. Polygons already the right size
-- (factor ~1) are unchanged.

create or replace function public.bulk_import_fields(p_org_id uuid, p_features jsonb)
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_feat jsonb;
  v_geom geography;
  v_geomg geometry;
  v_acres numeric;
  v_arpents numeric;
  v_acres_in numeric;
  v_cur_m2 double precision;
  v_target_m2 double precision;
  v_factor double precision;
  v_cx double precision;
  v_cy double precision;
  v_plantation_id uuid;
  v_plantation_name text;
  v_ratoon text;
  v_count integer := 0;
begin
  for v_feat in select * from jsonb_array_elements(p_features) loop
    v_geom := ST_GeomFromGeoJSON((v_feat->'geometry')::text)::geography;

    v_acres_in := nullif(btrim(coalesce(v_feat->>'acres', '')), '')::numeric;
    if v_acres_in is not null and v_acres_in > 0 then
      -- Rescale the polygon about its centroid so its true area = stated acres.
      v_cur_m2 := ST_Area(v_geom);
      v_target_m2 := v_acres_in / 0.000247105;
      if v_cur_m2 > 0 then
        v_factor := sqrt(v_target_m2 / v_cur_m2);
        v_geomg := v_geom::geometry;
        v_cx := ST_X(ST_Centroid(v_geomg));
        v_cy := ST_Y(ST_Centroid(v_geomg));
        v_geom := ST_Translate(
                    ST_Scale(ST_Translate(v_geomg, -v_cx, -v_cy), v_factor, v_factor),
                    v_cx, v_cy
                  )::geography;
      end if;
      v_acres := round(v_acres_in, 2);
    else
      v_acres := round((ST_Area(v_geom) * 0.000247105)::numeric, 2);
    end if;
    v_arpents := round((v_acres / 0.84628)::numeric, 2);

    -- Get-or-create the plantation by name (if one was mapped).
    v_plantation_id := null;
    v_plantation_name := nullif(btrim(coalesce(v_feat->>'plantation', '')), '');
    if v_plantation_name is not null then
      insert into plantations (org_id, name)
      values (p_org_id, v_plantation_name)
      on conflict (org_id, name) do nothing;
      select id into v_plantation_id
        from plantations where org_id = p_org_id and name = v_plantation_name;
    end if;

    v_ratoon := nullif(btrim(coalesce(v_feat->>'ratoon', '')), '');

    insert into fields (
      org_id, name, geometry, acreage_cached, arpents_cached,
      variety, current_ratoon, plantation_id
    )
    values (
      p_org_id,
      coalesce(nullif(btrim(coalesce(v_feat->>'name', '')), ''), 'Untitled'),
      v_geom, v_acres, v_arpents,
      nullif(btrim(coalesce(v_feat->>'variety', '')), ''),
      v_ratoon::ratoon_stage,
      v_plantation_id
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;
