-- Headland — units of measure
-- Each organization picks acres (default) or arpents (Louisiana French unit).
-- Editable later in /app/settings.

create type units_kind as enum ('acres', 'arpents');

alter table organizations
  add column units_default units_kind not null default 'acres';
