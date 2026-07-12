-- Spray/burn record-keeping detail on operation events: optional time of
-- operation, the LDAF burn category in effect, and the weather at the field
-- when it happened (hourly if a time was given, daily summary otherwise).
alter table operation_events
  add column if not exists occurred_time time,
  add column if not exists burn_category text,
  add column if not exists weather jsonb;
