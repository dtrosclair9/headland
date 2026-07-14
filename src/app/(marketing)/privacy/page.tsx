import type { Metadata } from 'next'
import { BASE_URL, SITE_NAME } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy',
  description: `${SITE_NAME}'s privacy policy. What we collect, what we don't sell, and who has access to your farm data.`,
  alternates: { canonical: `${BASE_URL}/privacy` },
}

const LAST_UPDATED = 'July 12, 2026'

export default function PrivacyPage() {
  return (
    <section className="section-padding bg-white">
      <div className="container-wide max-w-3xl">
        <h1 className="text-3xl font-bold text-primary mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: {LAST_UPDATED}</p>

        <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed space-y-5">
          <h2 className="text-xl font-bold text-primary mt-6">What we collect</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Email address and farm name when you sign up.</li>
            <li>Field boundaries (polygons), names, varieties, plant dates, ratoon stages, and notes you enter.</li>
            <li>Harvest records, application/operation logs, and scouting photos you upload.</li>
            <li>Standard server logs (IP address, user agent) for security and abuse prevention.</li>
          </ul>

          <h2 className="text-xl font-bold text-primary mt-6">Third-party services</h2>
          <p>{SITE_NAME} uses these services to operate. They each have their own privacy policies:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Supabase</strong> — database, authentication, file storage. Hosted on AWS US-East.</li>
            <li><strong>Resend</strong> — delivery of transactional email (sign-up confirmation and password-reset messages).</li>
            <li><strong>Mapbox</strong> — satellite map tiles and geocoding.</li>
            <li><strong>Open-Meteo</strong> — public weather forecasts (no account, queried by lat/lng only).</li>
            <li><strong>National Weather Service / Iowa State Mesonet</strong> — the official burn category for your area on burn records (queried by lat/lng only).</li>
            <li><strong>MyMemory</strong> — translates operation notes to Spanish for crew printouts. Only the note text you type is sent, and only when a translation is produced.</li>
            <li><strong>Vercel</strong> — hosting and edge delivery.</li>
            <li><strong>Stripe</strong> — payments and subscription management (when you upgrade to a paid plan).</li>
          </ul>

          <h2 className="text-xl font-bold text-primary mt-6">What we don&apos;t do</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>We do not sell, rent, or share your farm data with anyone.</li>
            <li>We do not aggregate yield or variety data and re-sell it to traders, brokers, or input suppliers.</li>
            <li>We do not run third-party analytics or advertising trackers in the app.</li>
          </ul>

          <h2 className="text-xl font-bold text-primary mt-6">Cookies</h2>
          <p>
            {SITE_NAME} sets a session cookie when you log in. That&apos;s it. No
            advertising cookies, no tracking pixels.
          </p>

          <h2 className="text-xl font-bold text-primary mt-6">Your data, your control</h2>
          <p>
            Your FSA acreage export (Esri shapefile) and printable crop maps are
            available during your trial and on a paid plan. If you cancel, your data stays
            in your account and remains accessible; we don&apos;t auto-delete it. You can
            delete your own data anytime, or submit a full account-deletion request through
            our{' '}
            <a href="/contact" className="text-primary underline">contact form</a>.
          </p>

          <h2 className="text-xl font-bold text-primary mt-6">Questions</h2>
          <p>
            Privacy questions go through our{' '}
            <a href="/contact" className="text-primary underline">contact form</a>. We
            respond within one business day.
          </p>
        </div>
      </div>
    </section>
  )
}
