-- Plans become SETS (Lance's feedback, 2026-07-23): a plan like "Ripener
-- Program" holds ordered colored steps ("First Fly" purple, "Second Fly"
-- blue, ...) that communicate — while picking blocks for step 3 the blocks in
-- steps 1-2 show locked in their colors, the whole program views/prints as
-- one multi-color map, and each program is selectable as a map layer.
-- fly_plans rows become the STEPS of a plan_groups row.

create table plan_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  -- Stamped when every step has been logged/completed; the group then reads
  -- as a finished program (still selectable as a layer — history matters).
  completed_at timestamptz
);

create index on plan_groups (org_id, created_at desc);

alter table plan_groups enable row level security;
alter table plan_groups force row level security;

create policy "plan_groups scoped" on plan_groups
  for all using (is_org_member(org_id))
  with check (is_org_member(org_id));

alter table fly_plans
  add column group_id uuid references plan_groups (id) on delete cascade,
  add column position int not null default 1;

create index on fly_plans (group_id, position);

-- The 5 existing plans were demo throwaways (Dayne, 2026-07-23: "wipe them
-- clean and start fresh") — remove so every step lives in a group from day 1.
delete from fly_plans;
