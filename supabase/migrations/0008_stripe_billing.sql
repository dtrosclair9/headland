-- Headland — Stripe billing fields on organizations.
-- Tracks the customer + active subscription so webhooks can sync state.

create type subscription_status as enum (
  'none',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete'
);

alter table organizations
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text unique,
  add column stripe_price_id text,
  add column subscription_status subscription_status not null default 'none',
  add column current_period_end timestamptz;

-- Allow the service-role key (and only the service-role key) to update billing
-- columns on RLS-enabled tables. The webhook handler runs with the service-role
-- secret and bypasses RLS by design, so no extra policy is required for that path.
