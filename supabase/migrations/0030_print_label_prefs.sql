-- Per-farm default for which block facts print on the plat sheets. Small
-- blocks get cluttered with all four; farmers pick their usual set and can
-- override per print.
alter table organizations
  add column print_label_fields text[] not null default '{name,variety,cut,acres}';
