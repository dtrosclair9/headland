import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'
import { isStripeConfigured } from '@/lib/stripe'
import { PLAN_LIMITS } from '@/lib/limits'
import UpgradeButtonClient from './UpgradeButtonClient'
import PortalForm from './PortalForm'

export const metadata: Metadata = { title: 'Billing' }

type UpgradeTier = 'starter' | 'pro' | 'business'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { org } = await requireUserAndOrg()
  const fields = await listFields(org.id)
  const stripeConfigured = isStripeConfigured()
  const limits = PLAN_LIMITS[org.plan_tier]
  const { status } = await searchParams

  const totalAcres = fields.reduce(
    (sum, f) => sum + Number(f.acreage_cached || 0),
    0,
  )

  return (
    <div className="container-wide py-8 max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-primary">Billing &amp; plan</h1>

      {status === 'success' && (
        <div className="rounded-md bg-green-50 border border-green-100 px-3 py-2 text-sm text-green-700">
          You&apos;re upgraded. Welcome aboard.
        </div>
      )}
      {status === 'cancelled' && (
        <div className="rounded-md bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-900">
          No charge — checkout was cancelled.
        </div>
      )}

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-lg font-bold text-primary">Current plan</h2>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              org.subscription_status === 'active'
                ? 'bg-green-100 text-green-800'
                : org.subscription_status === 'past_due'
                ? 'bg-red-100 text-red-800'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {org.subscription_status}
          </span>
        </div>
        <p className="text-2xl font-bold text-primary mb-3">{limits.name}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Stat label="Fields" used={fields.length} limit={limits.fields} />
          <Stat
            label="Acres"
            used={totalAcres}
            limit={limits.acres}
            format={(n) => n.toFixed(0)}
          />
          <Stat label="Users" used={1} limit={limits.users} />
          <Stat label="NDVI" used={limits.ndvi ? 'on' : 'off'} />
        </div>

        {org.current_period_end && (
          <p className="mt-4 text-xs text-gray-500">
            Renews on {new Date(org.current_period_end).toLocaleDateString()}
          </p>
        )}
      </section>

      {!stripeConfigured ? (
        <section className="bg-gray-50 border border-gray-100 rounded-xl p-6 text-sm text-gray-700">
          <p className="font-semibold text-primary mb-2">Stripe not configured</p>
          <p>
            To enable upgrades, set the following in{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">.env.local</code> and restart:
          </p>
          <ul className="mt-2 list-disc list-inside space-y-0.5">
            <li><code className="bg-gray-100 px-1 rounded text-xs">STRIPE_SECRET_KEY</code></li>
            <li><code className="bg-gray-100 px-1 rounded text-xs">STRIPE_WEBHOOK_SECRET</code></li>
            <li><code className="bg-gray-100 px-1 rounded text-xs">STRIPE_PRICE_STARTER</code> ($99/mo flat)</li>
            <li><code className="bg-gray-100 px-1 rounded text-xs">STRIPE_PRICE_PRO</code> ($3/ac/yr · 1,500 ac min)</li>
            <li><code className="bg-gray-100 px-1 rounded text-xs">STRIPE_PRICE_BUSINESS</code> ($2.50/ac/yr · 4,000 ac min)</li>
          </ul>
          <p className="mt-3">
            Create the products at{' '}
            <a href="https://dashboard.stripe.com/products" target="_blank" rel="noreferrer" className="text-primary underline">
              dashboard.stripe.com/products
            </a>
            . Enterprise tier is sales-led and uses a custom-quote contract — no Stripe price needed.
          </p>
        </section>
      ) : org.plan_tier === 'free' ? (
        <section>
          <h2 className="text-lg font-bold text-primary mb-3">Pick a plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UpgradeCard tier="starter" />
            <UpgradeCard tier="pro" />
            <UpgradeCard tier="business" recommended />
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Need 4,000+ acres or a custom contract?{' '}
            <Link href="/contact" className="underline">Talk to us about Enterprise</Link>.
          </p>
        </section>
      ) : (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="text-lg font-bold text-primary mb-2">Manage subscription</h2>
          <p className="text-sm text-gray-600 mb-4">
            Update payment method, switch plans, view invoices, or cancel anytime in the
            secure Stripe portal.
          </p>
          <PortalForm />
        </section>
      )}

      <p className="text-xs text-gray-500">
        Looking for the public pricing breakdown?{' '}
        <Link href="/pricing" className="underline">/pricing</Link>
      </p>
    </div>
  )
}

function Stat({
  label,
  used,
  limit,
  format,
}: {
  label: string
  used: number | string
  limit?: number | string
  format?: (n: number) => string
}) {
  const showLimit = typeof limit === 'number' && Number.isFinite(limit)
  const formatted = typeof used === 'number' && format ? format(used) : used
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
        {label}
      </p>
      <p className="text-lg font-bold text-primary mt-0.5">
        {formatted}
        {showLimit && (
          <span className="text-sm font-normal text-gray-500"> / {limit}</span>
        )}
        {typeof limit === 'number' && !Number.isFinite(limit) && (
          <span className="text-sm font-normal text-gray-500"> / unlimited</span>
        )}
      </p>
    </div>
  )
}

const UPGRADE_LABELS: Record<UpgradeTier, { price: string; blurb: string }> = {
  starter: {
    price: '$99 / mo',
    blurb: 'Up to 500 ac, 25 fields, 2 users. Long-tail family farms.',
  },
  pro: {
    price: '$3 / ac / yr',
    blurb: '500–1,500 ac, 100 fields, 5 users. $1,500 / yr minimum.',
  },
  business: {
    price: '$2.50 / ac / yr',
    blurb: '1,500–4,000 ac, unlimited fields, 10 users. $3,750 / yr minimum.',
  },
}

function UpgradeCard({ tier, recommended }: { tier: UpgradeTier; recommended?: boolean }) {
  const labels = UPGRADE_LABELS[tier]
  const limits = PLAN_LIMITS[tier]
  return (
    <div
      className={`bg-white rounded-xl p-5 flex flex-col border ${
        recommended ? 'border-accent shadow-md ring-1 ring-accent/40' : 'border-gray-100'
      }`}
    >
      {recommended && (
        <p className="text-xs font-bold uppercase tracking-wider text-accent-dark mb-1">
          Recommended
        </p>
      )}
      <h3 className="text-lg font-bold text-primary">{limits.name}</h3>
      <p className="text-2xl font-bold text-primary mt-2">{labels.price}</p>
      <p className="text-sm text-gray-600 mt-2 mb-4 leading-relaxed flex-1">{labels.blurb}</p>
      <UpgradeButtonClient tier={tier} />
    </div>
  )
}
