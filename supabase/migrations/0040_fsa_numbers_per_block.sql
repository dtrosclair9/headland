-- FSA identifiers belong on the BLOCK, not the plantation. Farm > Tract > Field:
-- a farm holds multiple tracts, and a grower "plantation" (named area) can span
-- multiple tracts/farms. Storing farm/tract only on the plantation loses a
-- block's true numbers whenever a plantation isn't exactly one tract — and the
-- export would then write the wrong (or missing) tract/farm for those blocks.
-- Store farm + tract + CLU per block so every block round-trips exactly, no
-- matter how plantations are grouped.

alter table public.fields
  add column if not exists fsa_farm_number text,
  add column if not exists fsa_tract_number text,
  add column if not exists clu_number text;

-- Recreate the view to expose the new columns. MUST keep security_invoker=true
-- (0037 restored it after a cross-tenant read breach in 0019 — never drop it).
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
    f.created_at,
    f.fsa_farm_number,
    f.fsa_tract_number,
    f.clu_number
   FROM fields f
     LEFT JOIN plantations p ON p.id = f.plantation_id;

alter table public.fields force row level security;

-- Import now writes the FSA numbers onto each block AND still onto the
-- plantation (as convenient metadata / default). Each feature may carry
-- 'farm', 'tract', 'clu'.
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
  v_clu text;
  v_ratoon text;
  v_count integer := 0;
begin
  for v_feat in select * from jsonb_array_elements(p_features) loop
    v_geom := ST_GeomFromGeoJSON((v_feat->'geometry')::text)::geography;

    v_acres_in := nullif(btrim(coalesce(v_feat->>'acres', '')), '')::numeric;
    if v_acres_in is not null and v_acres_in > 0 then
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

    v_tract := nullif(btrim(coalesce(v_feat->>'tract', '')), '');
    v_farm := nullif(btrim(coalesce(v_feat->>'farm', '')), '');
    v_clu := nullif(btrim(coalesce(v_feat->>'clu', '')), '');

    -- Get-or-create the plantation by name; capture tract/farm as plantation
    -- metadata too (non-destructive: fills only when currently null).
    v_plantation_id := null;
    v_plantation_name := nullif(btrim(coalesce(v_feat->>'plantation', '')), '');
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
      variety, current_ratoon, plantation_id,
      fsa_farm_number, fsa_tract_number, clu_number
    )
    values (
      p_org_id,
      coalesce(nullif(btrim(coalesce(v_feat->>'name', '')), ''), 'Untitled'),
      v_geom, v_acres, v_arpents,
      nullif(btrim(coalesce(v_feat->>'variety', '')), ''),
      v_ratoon::ratoon_stage,
      v_plantation_id,
      v_farm, v_tract, v_clu
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;
