-- Import: bulk-create fields from a parsed shapefile, with variety, ratoon, and
-- auto-created sections. Geometry-only bulk_create_fields (0004) stays for any
-- other caller; this richer one powers /app/import.
--
-- Each feature: { name, geometry (GeoJSON Polygon), variety?, ratoon?, section? }
-- Sections are get-or-created by name (unique per org). Acreage is computed
-- server-side from the polygon, identical to drawing a block by hand.
-- RLS still applies via is_org_member (security invoker).

create or replace function bulk_import_fields(
  p_org_id uuid,
  p_features jsonb
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
  v_section_id uuid;
  v_section_name text;
  v_ratoon text;
  v_count integer := 0;
begin
  for v_feat in select * from jsonb_array_elements(p_features) loop
    v_geom := ST_GeomFromGeoJSON((v_feat->'geometry')::text)::geography;
    v_acres := round((ST_Area(v_geom) * 0.000247105)::numeric, 2);
    v_arpents := round((v_acres / 0.84628)::numeric, 2);

    -- Get-or-create the section by name (if one was mapped).
    v_section_id := null;
    v_section_name := nullif(btrim(coalesce(v_feat->>'section', '')), '');
    if v_section_name is not null then
      insert into sections (org_id, name)
      values (p_org_id, v_section_name)
      on conflict (org_id, name) do nothing;
      select id into v_section_id
        from sections where org_id = p_org_id and name = v_section_name;
    end if;

    v_ratoon := nullif(btrim(coalesce(v_feat->>'ratoon', '')), '');

    insert into fields (
      org_id, name, geometry, acreage_cached, arpents_cached,
      variety, current_ratoon, section_id
    )
    values (
      p_org_id,
      coalesce(nullif(btrim(coalesce(v_feat->>'name', '')), ''), 'Untitled'),
      v_geom, v_acres, v_arpents,
      nullif(btrim(coalesce(v_feat->>'variety', '')), ''),
      v_ratoon::ratoon_stage,
      v_section_id
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
