-- Per-farm custom map colors. Farmers matching Headland to their existing
-- FarmWorks (or paper) color conventions pick their own hex per year-cane
-- stage and per variety. Absent rows fall back to the built-in defaults
-- (RATOON_COLORS / the variety palette), so this table only stores overrides.

create table org_colors (
  org_id uuid not null references organizations (id) on delete cascade,
  -- 'stage' keys are ratoon_stage values; 'variety' keys are the exact
  -- variety strings on the org's fields.
  kind text not null check (kind in ('stage', 'variety')),
  key text not null,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now(),
  primary key (org_id, kind, key)
);

alter table org_colors enable row level security;

create policy "org_colors scoped" on org_colors
  for all using (is_org_member(org_id))
  with check (is_org_member(org_id));
