-- Headland — per-organization US state
-- LA + FL workflows diverge enough that the UI filters by state:
--  - Variety dropdowns (Ho/HoCP/HoL/L for LA; CP for FL)
--  - Operation types (FL pre-harvest burn; LA stubble shave)
--  - Stubble cycle defaults (LA ~4 crops; FL ~3 crops)
--  - Region landing pages and copy
-- Nullable for now; signup requires it for new orgs.

create type us_cane_state as enum ('LA', 'FL');

alter table organizations
  add column state us_cane_state;
