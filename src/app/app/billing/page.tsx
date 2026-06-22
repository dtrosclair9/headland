import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUserAndOrg } from '@/lib/orgs'
import { isStripeConfigured } from '@/lib/stripe'
import {
  PRICING,
  hasActiveSubscription,
  isCompAccount,
  isInTrial,
  trialDaysLeft,
} from '@/lib/billing'
import UpgradeButtonClient from './UpgradeButtonClient'
import PortalForm from './PortalForm'

export const metadata: Metadata = { title: 'Billing' }

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { org } = await requireUserAndOrg()
  const stripeConfigured = isStripeConfigured()
  const { status } = await searchParams

  const comped = isCompAccount(org)
  const subscribed = hasActiveSubscription(org)
  const onTrial = isInTrial(org)
  const daysLeft = trialDaysLeft(org)

  return (
    <div className="container-wide py-8 max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-primary">Billing &amp; plan</h1>

      {status === 'success' && (
        <div className="rounded-md bg-green-50 border border-green-100 px-3 py-2 text-sm text-green-700">
          You&apos;re all set — subscription active. Thank you.
        </div>
      )}
      {status === 'cancelled' && (
        <div className="rounded-md bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-900">
          No charge — checkout was cancelled.
        </div>
      )}

      {/* Status */}
      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-lg font-bold text-primary">Headland</h2>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              comped || subscribed
                ? 'bg-green-100 text-green-800'
                : onTrial
                ? 'bg-blue-100 text-blue-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {comped ? 'complimentary' : subscribed ? org.subscription_status : onTrial ? 'free trial' : 'trial ended'}
          </span>
        </div>

        {comped ? (
          <p className="text-sm text-gray-600">
            You have complimentary full access — no subscription needed. Map, print, and
            record without limits.
          </p>
        ) : subscribed ? (
          <p className="text-sm text-gray-600">
            Your subscription is active.
            {org.current_period_end && (
              <> Renews {new Date(org.current_period_end).toLocaleDateString()}.</>
            )}
          </p>
        ) : onTrial ? (
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-primary">{daysLeft} day{daysLeft === 1 ? '' : 's'} left</span>{' '}
            in your free trial. Subscribe anytime to keep going — full access, no block limits.
          </p>
        ) : (
          <p className="text-sm text-gray-600">
            Your free trial has ended. Subscribe to keep drawing, printing, and recording. Your
            blocks and history are saved and waiting.
          </p>
        )}
      </section>

      {/* Subscribe / manage */}
      {!stripeConfigured ? (
        <section className="bg-gray-50 border border-gray-100 rounded-xl p-6 text-sm text-gray-700">
          <p className="font-semibold text-primary mb-2">Payments not enabled yet</p>
          <p>Stripe keys aren&apos;t configured on this environment. Set them in Vercel to turn on subscriptions.</p>
        </section>
      ) : comped ? (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="text-lg font-bold text-primary mb-2">Complimentary access</h2>
          <p className="text-sm text-gray-600">
            This account has full access at no charge. You won&apos;t be billed.
          </p>
          {subscribed && (
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-3">
                You also have a paid subscription on file — manage or cancel it anytime in the
                secure Stripe portal.
              </p>
              <PortalForm />
            </div>
          )}
        </section>
      ) : subscribed ? (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="text-lg font-bold text-primary mb-2">Manage subscription</h2>
          <p className="text-sm text-gray-600 mb-4">
            Update payment method, switch monthly/annual, view invoices, or cancel anytime in the
            secure Stripe portal.
          </p>
          <PortalForm />
        </section>
      ) : (
        <section>
          <h2 className="text-lg font-bold text-primary mb-3">Subscribe</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PlanCard
              title="Monthly"
              price={`$${PRICING.monthly}`}
              cadence="/ month"
              blurb="Everything, billed monthly. Cancel anytime."
              interval="monthly"
              variant="primary"
            />
            <PlanCard
              title="Annual"
              price={`$${PRICING.annual.toLocaleString()}`}
              cadence="/ year"
              blurb={`Two months free vs monthly ($${(PRICING.monthly * 12).toLocaleString()}/yr).`}
              interval="annual"
              variant="ghost"
              badge="Best value"
            />
          </div>
          <p className="mt-4 text-xs text-gray-500">
            One flat price — every block, plantation, print, and record included. No per-acre math.
          </p>
        </section>
      )}

      <p className="text-xs text-gray-500">
        Public pricing: <Link href="/pricing" className="underline">/pricing</Link>
      </p>
    </div>
  )
}

function PlanCard({
  title,
  price,
  cadence,
  blurb,
  interval,
  variant,
  badge,
}: {
  title: string
  price: string
  cadence: string
  blurb: string
  interval: 'monthly' | 'annual'
  variant: 'primary' | 'ghost'
  badge?: string
}) {
  return (
    <div className={`bg-white rounded-xl p-5 flex flex-col border ${badge ? 'border-accent ring-1 ring-accent/40' : 'border-gray-100'}`}>
      {badge && (
        <p className="text-xs font-bold uppercase tracking-wider text-accent-dark mb-1">{badge}</p>
      )}
      <h3 className="text-lg font-bold text-primary">{title}</h3>
      <p className="text-2xl font-bold text-primary mt-1">
        {price}<span className="text-sm font-normal text-gray-500"> {cadence}</span>
      </p>
      <p className="text-sm text-gray-600 mt-2 mb-4 leading-relaxed flex-1">{blurb}</p>
      <UpgradeButtonClient interval={interval} label={`Subscribe ${title.toLowerCase()}`} variant={variant} />
    </div>
  )
}
