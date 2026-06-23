import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { getBillableAcres } from '@/lib/acreage'

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

  // Single flat plan — no tiers. Paid access is governed entirely by
  // subscription_status; comp access lives in the separate `comped` flag,
  // which this sync never touches (so a subscription can't clobber it).

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

// Recompute the org's mapped acreage and update the Stripe subscription
// quantity to match, so the upcoming renewal bills the CURRENT acreage. Called
// from the invoice.upcoming webhook (true-up at renewal). proration_behavior
// 'none' means no mid-cycle charge — the new quantity lands on the next invoice,
// which (at invoice.upcoming time) is the renewal about to be created.
export async function trueUpAcreage(subscription: Stripe.Subscription): Promise<void> {
  const orgId = (subscription.metadata?.org_id as string | undefined) ?? null
  const item = subscription.items.data[0]
  if (!orgId || !item) return

  const currentQty = item.quantity ?? 0
  const acres = await getBillableAcres(orgId)
  // Never push the meter below 1 (or to 0) on an active sub — keep last good.
  if (acres < 1 || acres === currentQty) return

  const stripe = getStripe()
  await stripe.subscriptions.update(subscription.id, {
    items: [{ id: item.id, quantity: acres }],
    proration_behavior: 'none',
  })
}
