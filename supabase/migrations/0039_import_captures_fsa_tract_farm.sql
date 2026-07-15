-- Capture FSA identifiers on import so the export round-trips. FSA CLU and
-- FarmWorks shapefiles carry the tract number (TRACTNBR / tract_numb) and farm
-- number (FARMNBR / farm_numbe), and the export (farm-export.ts) READS
-- plantations.fsa_tract_number / fsa_farm_number to write them back out. Before
-- this, import created plantations with those columns null, so an FSA-imported
-- farm exported with blank tract/farm. Now each feature can carry 'tract' and
-- 'farm'; we set them on the plantation, filling only when currently null so a
-- re-import never clobbers a value the grower has since edited.

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
  v_tract text;
  v_farm text;
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

    -- Get-or-create the plantation by name (if one was mapped), capturing the
    -- FSA tract/farm numbers. coalesce(existing, new) fills them only when the
    -- plantation doesn't already have a value — so a re-import is non-destructive.
    v_plantation_id := null;
    v_plantation_name := nullif(btrim(coalesce(v_feat->>'plantation', '')), '');
    v_tract := nullif(btrim(coalesce(v_feat->>'tract', '')), '');
    v_farm := nullif(btrim(coalesce(v_feat->>'farm', '')), '');
    if v_plantation_name is not null then
      insert into plantations (org_id, name, fsa_tract_number, fsa_farm_number)
      values (p_org_id, v_plantation_name, v_tract, v_farm)
      on conflict (org_id, name) do update
        set fsa_tract_number = coalesce(plantations.fsa_tract_number, excluded.fsa_tract_number),
            fsa_farm_number  = coalesce(plantations.fsa_farm_number, excluded.fsa_farm_number);
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
