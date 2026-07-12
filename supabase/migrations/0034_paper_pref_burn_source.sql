-- Farm default paper size for prints (letter/legal/tabloid), provenance on
-- auto-fetched burn categories, and clearing the dead baked-SVG snapshots
-- (the record route re-renders from snapshot_blocks now).
alter table organizations
  add column if not exists print_paper text;

alter table operation_events
  add column if not exists burn_category_source text;

update operation_events set snapshot_svg = null where snapshot_svg is not null;
