-- Remove the vestigial plan_tier enum now that access is governed by
-- subscription_status (paying) + the comped flag (free access) + the trial
-- window. Run only AFTER the code that stopped reading/writing plan_tier is
-- deployed (see 0014 for the additive first half).

alter table organizations drop column if exists plan_tier;

drop type if exists plan_tier;
