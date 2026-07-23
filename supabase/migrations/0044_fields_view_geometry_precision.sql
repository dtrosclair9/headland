-- The map payload ships every block's boundary as GeoJSON. ST_AsGeoJSON's
-- default precision (9 decimals, ~0.1mm) bloats coordinates with digits no
-- field boundary can use — FSA CLU data itself is ~1m accurate. 6 decimals
-- (~11cm) cuts the serialized payload roughly a third at zero visible cost
-- (measured on the 2026-07-23 15k-block scale test; part of the 12.5s→target
-- load-time fix).
--
-- IMPORTANT (see feedback_headland_view_security_invoker): any recreate of
-- this view MUST keep security_invoker = true.

create or replace view fields_view with (security_invoker = true) as
select
  f.id,
  f.org_id,
  f.name,
  st_asgeojson(f.geometry::geometry, 6)::jsonb as geometry,
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
  f.created_at,
  f.fsa_farm_number,
  f.fsa_tract_number,
  f.clu_number,
  f.clu_id
from fields f
left join plantations p on p.id = f.plantation_id;
