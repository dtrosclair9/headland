-- Monthly (and manual) frozen snapshots of a farm's full state. The zip file
-- lives in the private `farm-snapshots` Storage bucket; this row is the
-- backed-up metadata index.
create table farm_snapshots (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  period        date not null,                 -- first day of the snapshot month
  trigger       text not null check (trigger in ('auto', 'manual')),
  storage_path  text not null,
  file_size     bigint,
  block_count   int not null default 0,
  acreage       numeric(12, 2) not null default 0,
  harvest_count int not null default 0,
  spray_count   int not null default 0,
  created_at    timestamptz not null default now()
);
create index on farm_snapshots (org_id, period desc);
-- A month can only auto-snapshot once; manual snapshots may repeat.
create unique index farm_snapshots_auto_period
  on farm_snapshots (org_id, period) where trigger = 'auto';

alter table farm_snapshots enable row level security;
create policy "members read own org snapshots" on farm_snapshots
  for select using (is_org_member(org_id));
-- No insert/update/delete policy: only the service role (which bypasses RLS)
-- writes snapshots.

-- Private bucket for the zip files. Service role reads/writes; downloads are
-- handed to users as short-lived signed URLs, so no public/user storage policy
-- is needed.
insert into storage.buckets (id, name, public)
values ('farm-snapshots', 'farm-snapshots', false)
on conflict (id) do nothing;
