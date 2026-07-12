-- Point-in-time BLOCK DATA on operation events (facts + geometry of the
-- touched plantations' blocks at event time), so the record document can
-- re-render at any paper size / label-field choice instead of serving one
-- baked SVG. has_snapshot lets the feed gate its "View map" link without
-- pulling either heavy payload.
alter table operation_events
  add column if not exists snapshot_blocks jsonb;

alter table operation_events
  add column if not exists has_snapshot boolean
  generated always as (snapshot_svg is not null or snapshot_blocks is not null) stored;
