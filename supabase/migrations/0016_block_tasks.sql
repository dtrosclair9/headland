-- Per-block to-do list. Simple checklist items hanging off a block (field),
-- mirroring how scouting_pins / harvests attach to a field with org-scoped RLS.
-- v1: free text + done. No due dates, assignees, or location.

create table block_tasks (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields (id) on delete cascade,
  text text not null,
  done boolean not null default false,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null
);

-- Serves both the per-block list and the open-count lookup for the map badge.
create index on block_tasks (field_id, done, created_at desc);

alter table block_tasks enable row level security;

create policy "block_tasks scoped" on block_tasks
  for all using (is_org_member((select org_id from fields where id = field_id)))
  with check (is_org_member((select org_id from fields where id = field_id)));
