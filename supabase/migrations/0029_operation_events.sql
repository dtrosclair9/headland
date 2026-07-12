-- Bulk operations as first-class history. Farmers work in passes, not blocks:
-- "sprayed these 15 on the 12th" is ONE event. Each bulk log (to-do batch,
-- field-work pass, plan completion) stores one event row carrying a
-- point-in-time SVG snapshot of the crop map showing what was done where —
-- the per-block rows stay for block pages, tagged with event_id so the feed
-- shows the event instead of 15 identical lines.

create table operation_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  kind text not null check (kind in ('todo', 'application')),
  title text not null,
  detail text,
  color text not null default '#DC2626' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  block_ids uuid[] not null,
  block_count int not null,
  acres numeric(12, 2),
  -- Point-in-time crop-map snapshot (SVG markup) — geometry changes later
  -- never rewrite history.
  snapshot_svg text,
  occurred_at date not null default current_date,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index on operation_events (org_id, occurred_at desc);

alter table operation_events enable row level security;
create policy "operation_events scoped" on operation_events
  for all using (is_org_member(org_id))
  with check (is_org_member(org_id));

alter table applications
  add column event_id uuid references operation_events (id) on delete set null;
alter table block_tasks
  add column event_id uuid references operation_events (id) on delete set null;
