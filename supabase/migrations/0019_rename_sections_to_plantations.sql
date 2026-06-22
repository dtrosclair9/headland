-- Rename the "sections" concept to "plantations" — grower terminology (what
-- Boudreaux/Trosclair actually call their field groupings). This is a pure
-- rename: table, the fields FK column, indexes, the RLS policy, the fields_view,
-- and the bulk_import_fields RPC all move to the new name. No row data changes.

begin;

-- 1. Table + the fields foreign-key column.
alter table public.sections rename to plantations;
alter table public.fields rename column section_id to plantation_id;

-- 2. Index + policy names (cosmetic — keeps the schema self-consistent).
alter index public.sections_pkey rename to plantations_pkey;
alter index public.sections_org_id_name_key rename to plantations_org_id_name_key;
alter index public.sections_org_active_idx rename to plantations_org_active_idx;
alter index public.fields_section_idx rename to fields_plantation_idx;
alter policy "sections scoped" on public.plantations rename to "plantations scoped";

-- 3. Recreate fields_view exposing plantation_id + plantation_name (a view's
--    output columns can't be renamed in place, so drop + recreate).
drop view if exists public.fields_view;
create view public.fields_view as
  select
    f.id,
    f.org_id,
    f.name,
    st_asgeojson(f.geometry::geometry)::jsonb as geometry,
    st_x(f.centroid::geometry) as centroid_lng,
    st_y(f.centroid::geometry) as centroid_lat,
    f.acreage_cached,
    f.arpents_cached,
    f.variety,
    f.plant_date,
    f.current_ratoon,
    f.notes,
    f.plantation_id,
    p.name as plantation_name,
    f.archived_at,
    f.created_at
  from fields f
  left join plantations p on p.id = f.plantation_id;

-- 4. Import RPC: get-or-create plantations by name; set fields.plantation_id.
--    The import payload key is now 'plantation' (was 'section') — kept in sync
--    with the commit route.
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
  v_plantation_id uuid;
  v_plantation_name text;
  v_ratoon text;
  v_count integer := 0;
begin
  for v_feat in select * from jsonb_array_elements(p_features) loop
    v_geom := ST_GeomFromGeoJSON((v_feat->'geometry')::text)::geography;
    v_acres := round((ST_Area(v_geom) * 0.000247105)::numeric, 2);
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

commit;
