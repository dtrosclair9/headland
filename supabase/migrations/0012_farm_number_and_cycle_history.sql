-- Headland — farm number on sections + year-over-year cycle history.
--
-- (1) An operation spans multiple FSA farms (confirmed from the father-in-law's
-- FarmWorks data: farm_numbe is tracked per block, and his land is split across
-- Foley / Woodlawn / Rosedale / Ingleside / leased farms). A single org-level
-- farm number is too coarse, so the farm number belongs on the Section
-- (= the grower's farm). org.fsa_farm_number stays as a fallback default.
--
-- (2) field_cycle_history records each rotation (year cane advance) so we can
-- show a block's history across crop years (plant cane → 1st → 2nd …). Rows are
-- written by the rotate action; nothing else changes.

alter table sections
  add column fsa_farm_number text;

create table field_cycle_history (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields (id) on delete cascade,
  crop_year int not null,
  previous_stage ratoon_stage,
  new_stage ratoon_stage not null,
  created_at timestamptz not null default now()
);
create index on field_cycle_history (field_id, crop_year);

alter table field_cycle_history enable row level security;
-- Scoped through the parent field's org, same pattern as harvests/applications.
create policy "field_cycle_history scoped" on field_cycle_history
  for all using (is_org_member((select org_id from fields where id = field_id)))
  with check (is_org_member((select org_id from fields where id = field_id)));
