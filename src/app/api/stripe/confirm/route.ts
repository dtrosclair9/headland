import { NextResponse, type NextRequest } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { syncSubscriptionToOrg } from '@/lib/stripe-sync'
import { BASE_URL } from '@/lib/site'

export const runtime = 'nodejs'

// Stripe redirects here (GET) after a completed checkout. We reconcile the
// subscription into the DB synchronously — before the billing page renders —
// so the trial-ended banner and status badge are correct immediately, without
// waiting on the async webhook (which may be slow or, in a fresh environment,
// not yet configured). The webhook remains the source of truth for later
// lifecycle events (renewals, cancellations).
export async function GET(request: NextRequest) {
  const billingUrl = `${BASE_URL}/app/billing?status=success`

  // requireUserAndOrg redirects unauthenticated users to /login.
  const { org } = await requireUserAndOrg()

  const sessionId = request.nextUrl.searchParams.get('session_id')
  if (!isStripeConfigured() || !sessionId) {
    // Nothing to reconcile — fall through to the billing page, which will
    // reflect whatever the webhook eventually writes.
    return NextResponse.redirect(billingUrl)
  }

  try {
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    })

    // Guard: the session must belong to this org. We trust the subscription's
    // own org_id metadata (set at checkout) over the session_id in the URL.
    const subscription =
      typeof session.subscription === 'object' && session.subscription
        ? session.subscription
        : null

    if (subscription && subscription.metadata?.org_id === org.id) {
      await syncSubscriptionToOrg(subscription)
    }
  } catch {
    // Reconciliation is best-effort; the webhook is the backstop. Never block
    // the user's return on a Stripe hiccup.
  }

  return NextResponse.redirect(billingUrl)
}
