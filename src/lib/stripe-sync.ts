import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'

// Writes a Stripe subscription's current state onto its org row. Shared by the
// async webhook (lifecycle events) and the synchronous confirm route (the
// checkout success return), so both reconcile the DB the exact same way.
export async function syncSubscriptionToOrg(subscription: Stripe.Subscription) {
  const admin = createAdminClient()

  const orgId = (subscription.metadata?.org_id as string | undefined) ?? null

  // Resolve org by metadata first, fall back to customer id.
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id

  const item = subscription.items.data[0]
  const priceId = item?.price.id ?? null
  // Single flat plan — no tiers. plan_tier is a vestigial paid/free marker:
  // 'pro' while the subscription is live, 'free' once it lapses. Comp accounts
  // (plan_tier 'enterprise') never run through Stripe, so this never clobbers them.
  const live = subscription.status === 'active' || subscription.status === 'trialing'

  // current_period_end moved off the top-level Subscription and onto the
  // subscription item in recent API versions (the SDK default here is
  // 2026-04-22.dahlia). Read the item first, fall back to the legacy
  // top-level field, and guard the null case — otherwise new Date(NaN)
  // .toISOString() throws and aborts the entire sync (webhook + confirm).
  const periodEndUnix: number | null =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((item as any)?.current_period_end ?? (subscription as any).current_period_end ?? null)

  const updates = {
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    subscription_status: subscription.status,
    plan_tier: live ? 'pro' : 'free',
    current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
  }

  if (orgId) {
    await admin.from('organizations').update(updates).eq('id', orgId)
  } else {
    await admin
      .from('organizations')
      .update(updates)
      .eq('stripe_customer_id', customerId)
  }
}
