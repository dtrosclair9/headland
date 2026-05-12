import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUserAndOrg } from '@/lib/orgs'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, isStripeConfigured, planTierToPriceId } from '@/lib/stripe'
import { BASE_URL } from '@/lib/site'

const Body = z.object({ tier: z.enum(['starter', 'pro', 'business']) })

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

  const priceId = planTierToPriceId(parsed.data.tier)
  if (!priceId) {
    return NextResponse.json(
      { error: 'price_not_configured', tier: parsed.data.tier },
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

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${BASE_URL}/app/billing?status=success`,
    cancel_url: `${BASE_URL}/app/billing?status=cancelled`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { org_id: org.id } },
  })

  if (!session.url) {
    return NextResponse.json({ error: 'session_failed' }, { status: 500 })
  }

  return NextResponse.json({ url: session.url })
}
