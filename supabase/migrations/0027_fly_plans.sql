-- Fly plans: a named, colored selection of blocks handed to a sprayer pilot.
-- "1st spray" = red on these 12 blocks, "2nd spray" = yellow on those 9, etc.
-- Viewed on the white plat map (only the plan's blocks colored) and printed
-- as a B&W sheet with the plan blocks filled in the plan color.

create table fly_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  color text not null default '#DC2626' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  -- Snapshot of selected block ids; intersected with live blocks at read time
  -- so a deleted block just drops out of the plan.
  block_ids uuid[] not null default '{}',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index on fly_plans (org_id, created_at desc);

alter table fly_plans enable row level security;

create policy "fly_plans scoped" on fly_plans
  for all using (is_org_member(org_id))
  with check (is_org_member(org_id));
