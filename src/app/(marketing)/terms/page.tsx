import type { Metadata } from 'next'
import { BASE_URL, SITE_NAME } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Terms',
  description: `${SITE_NAME}'s terms of service.`,
  alternates: { canonical: `${BASE_URL}/terms` },
}

const LAST_UPDATED = 'May 8, 2026'

export default function TermsPage() {
  return (
    <section className="section-padding bg-white">
      <div className="container-wide max-w-3xl">
        <h1 className="text-3xl font-bold text-primary mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: {LAST_UPDATED}</p>

        <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed space-y-5">
          <p>
            By using {SITE_NAME} (the &quot;Service&quot;), you agree to these terms. If you
            don&apos;t agree, don&apos;t use the Service.
          </p>

          <h2 className="text-xl font-bold text-primary mt-6">Your account</h2>
          <p>
            You&apos;re responsible for keeping your login credentials secure. The
            account owner can invite team members, who in turn can read and write farm
            data within that organization. Don&apos;t share login credentials across
            farms — each separate farm business needs its own
            subscription, and credential-sharing undermines the Service.
          </p>

          <h2 className="text-xl font-bold text-primary mt-6">Your data</h2>
          <p>
            You own the data you upload — field boundaries, harvest records, scouting
            photos, etc. {SITE_NAME} stores and processes it on your behalf solely to
            operate the Service. We don&apos;t resell, aggregate, or share it with
            third parties.
          </p>

          <h2 className="text-xl font-bold text-primary mt-6">Acceptable use</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Don&apos;t upload illegal content.</li>
            <li>Don&apos;t attempt to access other users&apos; data.</li>
            <li>Don&apos;t reverse-engineer the Service to compete with it.</li>
            <li>Don&apos;t use the Service for high-frequency programmatic requests beyond what a human would generate.</li>
          </ul>

          <h2 className="text-xl font-bold text-primary mt-6">Subscriptions and payment</h2>
          <p>
            Paid plans are billed in advance, monthly or annually, via Stripe. You can
            cancel at any time from settings; cancellations take effect at the end of
            the current billing period. We don&apos;t offer pro-rated refunds for partial
            months.
          </p>

          <h2 className="text-xl font-bold text-primary mt-6">Service availability</h2>
          <p>
            We do our best to keep the Service running 24/7, but we can&apos;t promise
            zero downtime. {SITE_NAME} is provided &quot;as is&quot; without warranty.
            Liability is limited to the amount you&apos;ve paid in the past 12 months.
          </p>

          <h2 className="text-xl font-bold text-primary mt-6">Termination</h2>
          <p>
            You can cancel anytime, and your data stays accessible — you can export or
            delete it whenever you want. We may terminate accounts for violations of
            these terms, with reasonable notice and a window to export your data first,
            except in cases of egregious abuse.
          </p>

          <h2 className="text-xl font-bold text-primary mt-6">Changes</h2>
          <p>
            We&apos;ll email you if these terms change materially. Continued use of the
            Service after a notice constitutes acceptance.
          </p>

          <h2 className="text-xl font-bold text-primary mt-6">Contact</h2>
          <p>
            Questions about these terms go through our{' '}
            <a href="/contact" className="text-primary underline">contact form</a>.
          </p>
        </div>
      </div>
    </section>
  )
}
