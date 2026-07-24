-- Map labels + color-by become a customizable, per-device-sticky live-map view
-- with a SHARED org default (2026-07-23). The label default used to be
-- print-only (print_label_fields); it now drives the live map too, so it's
-- renamed to label_fields and gains a color-by default plus a version stamp.
-- view_defaults_updated_at is bumped on every "save as default" and is how a
-- freshly-saved default propagates across one user's devices (see resolveMapView).
alter table organizations rename column print_label_fields to label_fields;

alter table organizations
  add column default_color_by text not null default 'stage'
    check (default_color_by in ('stage', 'variety'));

alter table organizations
  add column view_defaults_updated_at timestamptz not null default now();
