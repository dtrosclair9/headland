import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { getStripe, priceIdToPlanTier } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

async function syncSubscriptionToOrg(subscription: Stripe.Subscription) {
  const admin = createAdminClient()

  const orgId = (subscription.metadata?.org_id as string | undefined) ?? null

  // Resolve org by metadata first, fall back to customer id.
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id

  const priceId = subscription.items.data[0]?.price.id ?? null
  const tier = priceIdToPlanTier(priceId)

  const updates = {
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    subscription_status: subscription.status,
    plan_tier: tier,
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
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

export async function POST(request: NextRequest) {
  const stripe = getStripe()
  const sig = request.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!sig || !secret) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 400 })
  }

  const rawBody = await request.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret)
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_signature', message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    )
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.subscription && typeof session.subscription === 'string') {
        const sub = await stripe.subscriptions.retrieve(session.subscription)
        await syncSubscriptionToOrg(sub)
      }
      break
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await syncSubscriptionToOrg(event.data.object)
      break
    }
    default:
      // Ignore other events for now.
      break
  }

  return NextResponse.json({ received: true })
}
