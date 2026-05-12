-- Headland — add Business tier between Pro and Enterprise.
-- Reflects the new 5-tier structure that matches actual LA cane farm-size
-- distribution (see docs/farm-size-distribution.md).

alter type plan_tier add value if not exists 'business' before 'enterprise';
