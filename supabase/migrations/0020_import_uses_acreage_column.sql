-- Prevent the "imported acreage is wrong" failure: when the import maps an
-- acreage column (e.g. FarmWorks' "FSA acres"), trust that number as the source
-- of truth instead of computing acreage from the polygon. Source polygons are
-- often rough/oversized while the grower's stated acreage is correct — so the
-- number must come from the file, not the geometry, when it's available.
--
-- Feature payload gains an optional 'acres' key. If present and > 0, it sets
-- acreage_cached (and arpents = acres / 0.84628) directly; otherwise we fall
-- back to the geometry-derived area as before.

create or replace function public.bulk_import_fields(p_org_id uuid, p_features jsonb)
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_feat jsonb;
  v_geom geography;
  v_acres numeric;
  v_arpents numeric;
  v_acres_in numeric;
  v_plantation_id uuid;
  v_plantation_name text;
  v_ratoon text;
  v_count integer := 0;
begin
  for v_feat in select * from jsonb_array_elements(p_features) loop
    v_geom := ST_GeomFromGeoJSON((v_feat->'geometry')::text)::geography;

    -- Acreage: trust the mapped column when given; else derive from geometry.
    v_acres_in := nullif(btrim(coalesce(v_feat->>'acres', '')), '')::numeric;
    if v_acres_in is not null and v_acres_in > 0 then
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
