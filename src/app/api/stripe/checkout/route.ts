import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, isStripeConfigured, priceIdForInterval } from '@/lib/stripe'
import { getBillableAcres } from '@/lib/acreage'
import { BASE_URL } from '@/lib/site'

const Body = z.object({ interval: z.enum(['monthly', 'annual']) })

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'stripe_not_configured' }, { status: 503 })
  }

  const { user, org } = await requireUserAndOrg()
  const json = await request.json().catch(() => null)
  const parsed = Body.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const priceId = priceIdForInterval(parsed.data.interval)
  if (!priceId) {
    return NextResponse.json(
      { error: 'price_not_configured', interval: parsed.data.interval },
      { status: 503 },
    )
  }

  const stripe = getStripe()

  // Create or reuse the Stripe customer for this org.
  let customerId = org.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: org.name,
      metadata: { org_id: org.id },
    })
    customerId = customer.id

    const admin = createAdminClient()
    await admin
      .from('organizations')
      .update({ stripe_customer_id: customerId })
      .eq('id', org.id)
  }

  // Per-acre price: quantity = the org's total mapped acreage. Block checkout
  // if nothing's mapped yet — otherwise they'd subscribe at quantity 1 ($0.50)
  // and underpay until the next renewal true-up. Send them to import first.
  const acres = await getBillableAcres(org.id)
  if (acres < 1) {
    return NextResponse.json({ error: 'no_acreage' }, { status: 422 })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: acres }],
    // Route the return through /api/stripe/confirm so the subscription is
    // reconciled into the DB before the billing page renders — the banner and
    // badge are then correct immediately, not pending the async webhook.
    success_url: `${BASE_URL}/api/stripe/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/app/billing?status=cancelled`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { org_id: org.id } },
  })

  if (!session.url) {
    return NextResponse.json({ error: 'session_failed' }, { status: 500 })
  }

  return NextResponse.json({ url: session.url })
}
