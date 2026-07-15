-- Proactive-sweep hardening (2026-07-15). Three independent fixes:

-- 1. Drop the orphaned ditches table. The ditch layer was removed as a concept
--    (ditches are block boundaries; generic map_annotations replaced the
--    feature in 0026) and no code reads or writes this table.
drop table if exists public.ditches;

-- 2. rate_limit_hit was executable by any authenticated user, letting a
--    member inflate ANOTHER org's counters (key format is guessable:
--    'bulk:<org-id>') and grief their rate limits. Only server code calls it,
--    via the service-role client — no client grant is needed.
revoke execute on function public.rate_limit_hit(text, integer, integer) from anon, authenticated;

-- 3. Uniform force row level security. 0037 forced it on fields only; the
--    child tables' tenant isolation hinged on a single RLS policy each — the
--    exact single-point-of-failure class that caused the 0019 fields_view
--    breach. Forcing RLS means even owner-context queries stay filtered.
--    (memberships/organizations are NOT forced: their policies feed the
--    security-definer is_org_member helper, and forcing them would recurse.)
alter table public.harvests force row level security;
alter table public.applications force row level security;
alter table public.scouting_pins force row level security;
alter table public.block_tasks force row level security;
alter table public.plantations force row level security;
alter table public.field_cycle_history force row level security;
alter table public.map_annotations force row level security;
alter table public.operation_events force row level security;
alter table public.fly_plans force row level security;
alter table public.farm_snapshots force row level security;
alter table public.org_colors force row level security;
alter table public.field_imagery_cache force row level security;
