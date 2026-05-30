-- Replace the vestigial plan_tier enum with a single, self-documenting comp flag.
-- The product has no tiers: access = comped OR active subscription OR within trial.
-- This migration is additive (plan_tier stays) so the currently-deployed code
-- keeps working until the new code ships; 0015 drops plan_tier afterward.

alter table organizations
  add column if not exists comped boolean not null default false;

-- Carry over existing comp accounts (previously flagged via plan_tier 'enterprise').
update organizations set comped = true where plan_tier = 'enterprise';

comment on column organizations.comped is
  'Free, permanent access for internal/comp accounts. Bypasses the paywall regardless of subscription or trial state.';
