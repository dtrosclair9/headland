-- Plan lifecycle: logging work from a plan completes it — the record lives
-- in Operations, and the plan drops off the Plans tab (kept, not deleted,
-- in case an "archived plans" view is ever wanted).
alter table fly_plans
  add column if not exists completed_at timestamptz;
