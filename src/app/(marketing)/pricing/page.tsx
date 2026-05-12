import type { Metadata } from 'next'
import Link from 'next/link'
import { BASE_URL, SITE_NAME } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Per-acre pricing matched to real cane farm sizes. Free for the first 5 fields. Pro $3/ac. Business $2.50/ac. The bigger you get, the better the deal.',
  alternates: { canonical: `${BASE_URL}/pricing` },
}

const tiers = [
  {
    name: 'Starter',
    price: '$99',
    period: '/ mo',
    blurb: 'For long-tail family farms under 500 acres.',
    bullets: [
      'Up to 500 acres',
      'Up to 25 fields',
      '2 users',
      'Mapping, drawing, printing, exports',
      'Sentinel-2 NDVI + latest view',
      'Weather + 7-day forecast',
    ],
    cta: { label: 'Start free, upgrade later', href: '/signup' },
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$3',
    period: '/ ac / yr',
    blurb: 'For mid-size LA family farms — 500 to 1,500 acres.',
    bullets: [
      '500 – 1,500 acres',
      '$1,500 / yr minimum',
      'Up to 100 fields',
      'Up to 5 users',
      'Everything in Starter',
      'Bulk PDF print packs',
      'Email support',
    ],
    cta: { label: 'Start free, upgrade later', href: '/signup' },
    highlight: false,
  },
  {
    name: 'Business',
    price: '$2.50',
    period: '/ ac / yr',
    blurb: 'For consolidated working farms — 1,500 to 4,000 acres. The fat middle of modern Louisiana cane.',
    bullets: [
      '1,500 – 4,000 acres',
      '$3,750 / yr minimum',
      'Unlimited fields',
      'Up to 10 users',
      'Everything in Pro',
      'Priority support',
      'Onboarding call',
    ],
    cta: { label: 'Start free, upgrade later', href: '/signup' },
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: '$1.75',
    period: '/ ac / yr',
    blurb: 'For the largest LA operations + Florida SCGC growers — 4,000+ acres. Custom contract.',
    bullets: [
      '4,000+ acres',
      '$7,000 / yr minimum',
      'Unlimited everything',
      'Custom volume pricing',
      'Dedicated onboarding',
      'SSO + custom roles',
      'SLA + uptime guarantees',
    ],
    cta: { label: 'Talk to us', href: '/contact' },
    highlight: false,
  },
]

const sizeExamples = [
  { acres: 250, tier: 'Starter', annual: '$1,188' },
  { acres: 800, tier: 'Pro', annual: '$2,400' },
  { acres: 2_000, tier: 'Business', annual: '$5,000' },
  { acres: 6_000, tier: 'Enterprise', annual: '$10,500' },
  { acres: 10_000, tier: 'Enterprise', annual: '$17,500' },
  { acres: 20_000, tier: 'Enterprise', annual: '$35,000 · custom' },
]

export default function PricingPage() {
  return (
    <>
      <section className="bg-primary-dark text-white">
        <div className="container-wide py-16 md:py-20 text-center max-w-3xl mx-auto">
          <p className="section-label text-accent">Pricing</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold">
            Per-acre pricing matched to real cane farms.
          </h1>
          <p className="mt-4 text-lg text-gray-200">
            The bigger you get, the better the per-acre deal. No setup fees, no per-seat
            tax, no contracts on Pro or Business. Cancel anytime.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary/40 border border-primary-light/40 px-4 py-2 text-sm text-gray-100">
            <span className="font-semibold">Everyone starts free.</span>
            <span>5 fields · 100 acres · no card.</span>
            <Link href="/signup" className="ml-2 font-semibold underline hover:text-accent">
              Sign up →
            </Link>
          </div>
        </div>
      </section>

      <section className="section-padding bg-gray-50">
        <div className="container-wide grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`bg-white rounded-xl p-6 flex flex-col border ${
                t.highlight ? 'border-accent shadow-md ring-1 ring-accent/40' : 'border-gray-100'
              }`}
            >
              {t.highlight && (
                <p className="text-xs font-bold uppercase tracking-wider text-accent-dark mb-1">
                  Recommended
                </p>
              )}
              <h2 className="text-xl font-bold text-primary">{t.name}</h2>
              <p className="mt-3">
                <span className="text-3xl font-bold text-primary">{t.price}</span>
                {t.period && <span className="text-gray-500 text-sm ml-1">{t.period}</span>}
              </p>
              <p className="mt-3 text-sm text-gray-600 leading-relaxed">{t.blurb}</p>
              <ul className="mt-5 space-y-1.5 text-sm text-gray-700 flex-1">
                {t.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="text-accent-dark">✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={t.cta.href}
                className={`mt-6 text-center font-semibold py-2.5 rounded-md transition ${
                  t.highlight
                    ? 'bg-accent text-primary-dark hover:bg-accent-dark'
                    : 'bg-primary text-white hover:bg-primary-light'
                }`}
              >
                {t.cta.label}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-wide max-w-3xl">
          <h2 className="text-2xl font-bold text-primary mb-2">What it costs by farm size</h2>
          <p className="text-sm text-gray-600 mb-6">
            Cane revenue is $1,800–$2,200/ac/yr gross. {SITE_NAME} works out to about
            <strong> 0.1–0.2% of gross revenue</strong> at every size.
          </p>
          <div className="bg-gray-50 border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-gray-100">
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3 font-semibold">Farm size</th>
                  <th className="px-4 py-3 font-semibold">Tier</th>
                  <th className="px-4 py-3 font-semibold">Annual {SITE_NAME} cost</th>
                </tr>
              </thead>
              <tbody>
                {sizeExamples.map((row) => (
                  <tr key={row.acres} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-semibold text-primary">
                      {row.acres.toLocaleString()} ac
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.tier}</td>
                    <td className="px-4 py-3 text-gray-700">{row.annual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section-padding bg-gray-50">
        <div className="container-wide max-w-3xl">
          <h2 className="text-2xl font-bold text-primary mb-6">FAQ</h2>
          <div className="space-y-5 text-gray-700">
            <Faq q="Why per-acre pricing instead of flat?">
              Modern Louisiana cane has consolidated hard — 705 farms in 2017 became 420 in 2022, and
              average farm size doubled. Flat-fee pricing would either undercharge a 6,000-ac
              operation or overprice a 200-ac family farm. Per-acre with volume tiers lines up the
              bill with the value at every size.
            </Faq>
            <Faq q="Why does the per-acre rate go down as I get bigger?">
              Because the marginal value of {SITE_NAME} is highest on the first thousand acres
              (where you didn&apos;t have records-keeping software at all) and lower on the
              ten-thousandth (where you already had some system in place). Pricing should reflect
              that.
            </Faq>
            <Faq q="What happens if I exceed my plan&apos;s acreage cap?">
              We&apos;ll email you and prompt to upgrade to the next tier. We never lock your data —
              exports (GeoJSON, KML, PDF) are always available even on the free plan.
            </Faq>
            <Faq q="Can I cancel anytime?">
              Yes. Cancel from <code className="bg-gray-100 px-1 rounded text-sm">/app/billing</code>{' '}
              at any time. No retention call, no dark patterns. Your data stays accessible for 90
              days after cancellation.
            </Faq>
            <Faq q="Do you sell or aggregate my data?">
              No. {SITE_NAME} never sells, shares, or aggregates grower data with traders, brokers,
              input suppliers, or anyone else. Your tonnage, varieties, and field maps are yours.
            </Faq>
          </div>
        </div>
      </section>
    </>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="border-b border-gray-100 pb-3">
      <summary className="font-semibold text-primary cursor-pointer">{q}</summary>
      <p className="mt-2 leading-relaxed">{children}</p>
    </details>
  )
}
