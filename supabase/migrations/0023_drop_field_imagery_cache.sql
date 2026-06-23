-- Drop the unused satellite/NDVI imagery cache. The Sentinel Hub integration
-- (NDVI + true-color imagery) was removed: the target growers didn't value it,
-- it was an uncached per-view cost at scale, and it ran against the "modern but
-- not bloated" positioning. The table was declared in 0001 but never used by
-- application code, so dropping it loses no data anyone relied on.
drop table if exists field_imagery_cache;
