import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { syncSubscriptionToOrg, trueUpAcreage } from '@/lib/stripe-sync'

export const runtime = 'nodejs'

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
    case 'invoice.upcoming': {
      // Fires shortly before a renewal invoice is created. Recompute the org's
      // acreage and update the subscription quantity so the renewal bills the
      // current acreage (the "we'll true it up" promise on /pricing).
      const invoice = event.data.object
      // The subscription ref has moved across Stripe API versions — read both
      // the legacy top-level field and the newer parent.subscription_details.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyInvoice = invoice as any
      const subId: string | null =
        (typeof anyInvoice.subscription === 'string'
          ? anyInvoice.subscription
          : anyInvoice.subscription?.id) ??
        anyInvoice.parent?.subscription_details?.subscription ??
        null
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId)
        await trueUpAcreage(sub)
      }
      break
    }
    default:
      // Ignore other events for now.
      break
  }

  return NextResponse.json({ received: true })
}
