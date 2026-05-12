import { NextResponse } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { BASE_URL } from '@/lib/site'

export async function POST() {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'stripe_not_configured' }, { status: 503 })
  }

  const { org } = await requireUserAndOrg()
  if (!org.stripe_customer_id) {
    return NextResponse.json({ error: 'no_customer' }, { status: 400 })
  }

  const stripe = getStripe()
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${BASE_URL}/app/billing`,
  })

  return NextResponse.json({ url: session.url })
}
