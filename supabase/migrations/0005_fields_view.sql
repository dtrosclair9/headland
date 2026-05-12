-- Headland — view exposing fields with geometry serialized as GeoJSON for the map UI.
-- security_invoker = true → underlying RLS on fields applies to the view query.

create or replace view fields_view with (security_invoker = true) as
select
  f.id,
  f.org_id,
  f.name,
  ST_AsGeoJSON(f.geometry::geometry)::jsonb as geometry,
  ST_X(f.centroid::geometry) as centroid_lng,
  ST_Y(f.centroid::geometry) as centroid_lat,
  f.acreage_cached,
  f.arpents_cached,
  f.variety,
  f.plant_date,
  f.current_ratoon,
  f.notes,
  f.archived_at,
  f.created_at
from fields f;
