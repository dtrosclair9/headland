import type { Metadata } from 'next'
import Link from 'next/link'
import { BASE_URL, SITE_NAME } from '@/lib/site'
import { PRICING } from '@/lib/billing'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'One flat price. $297/month or $2,970/year (two months free). Every block, section, print, and record included. 14-day free trial, no card to start.',
  alternates: { canonical: `${BASE_URL}/pricing` },
}

const features = [
  'Unlimited blocks, sections, and ditches',
  'Crop-stage map + printable section maps',
  'Harvest, operation & spray records (with wind)',
  'Shapefile / GeoJSON / KML export for FSA',
  'Sentinel-2 NDVI + latest imagery',
  'Weather + 7-day forecast',
  'Every feature — no tiers, no per-acre math',
]

// Flat price = a shrinking per-acre cost as you grow. That's the pitch.
const sizeExamples = [
  { acres: 300, perAcre: '$11.88' },
  { acres: 800, perAcre: '$4.46' },
  { acres: 1500, perAcre: '$2.38' },
  { acres: 3000, perAcre: '$1.19' },
  { acres: 6000, perAcre: '$0.59' },
]

export default function PricingPage() {
  const annualMonthly = Math.round(PRICING.annual / 12)
  return (
    <>
      <section className="bg-primary-dark text-white">
        <div className="container-wide py-16 md:py-20 text-center max-w-3xl mx-auto">
          <p className="section-label text-accent">Pricing</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold">One flat price. Every acre you farm.</h1>
          <p className="mt-4 text-lg text-gray-200">
            No per-acre math, no tiers, no per-seat tax. The whole operation — drawn, colored,
            printed, and recorded — for one price. Cancel anytime.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary/40 border border-primary-light/40 px-4 py-2 text-sm text-gray-100">
            <span className="font-semibold">{PRICING.trialDays}-day free trial.</span>
            <span>Full access, no card to start.</span>
            <Link href="/signup" className="ml-2 font-semibold underline hover:text-accent">Sign up →</Link>
          </div>
        </div>
      </section>

      <section className="section-padding bg-gray-50">
        <div className="container-wide max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl p-6 flex flex-col border border-gray-100">
            <h2 className="text-xl font-bold text-primary">Monthly</h2>
            <p className="mt-3">
              <span className="text-4xl font-bold text-primary">${PRICING.monthly}</span>
              <span className="text-gray-500 text-sm ml-1">/ month</span>
            </p>
            <p className="mt-3 text-sm text-gray-600">Billed monthly. Cancel anytime.</p>
            <Link href="/signup" className="mt-6 text-center font-semibold py-2.5 rounded-md bg-primary text-white hover:bg-primary-light transition">
              Start free trial
            </Link>
          </div>
          <div className="bg-white rounded-xl p-6 flex flex-col border border-accent ring-1 ring-accent/40">
            <p className="text-xs font-bold uppercase tracking-wider text-accent-dark mb-1">Best value</p>
            <h2 className="text-xl font-bold text-primary">Annual</h2>
            <p className="mt-3">
              <span className="text-4xl font-bold text-primary">${PRICING.annual.toLocaleString()}</span>
              <span className="text-gray-500 text-sm ml-1">/ year</span>
            </p>
            <p className="mt-3 text-sm text-gray-600">
              ≈ ${annualMonthly}/mo — two months free vs monthly.
            </p>
            <Link href="/signup" className="mt-6 text-center font-semibold py-2.5 rounded-md bg-accent text-primary-dark hover:bg-accent-dark transition">
              Start free trial
            </Link>
          </div>
        </div>

        <div className="container-wide max-w-3xl mt-6">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-gray-700">
            {features.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="text-accent-dark">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-wide max-w-3xl">
          <h2 className="text-2xl font-bold text-primary mb-2">The bigger you farm, the better the deal</h2>
          <p className="text-sm text-gray-600 mb-6">
            One flat ${PRICING.monthly}/mo (${PRICING.annual.toLocaleString()}/yr) means the cost per acre
            shrinks as your operation grows — a rounding error against your input bill.
          </p>
          <div className="bg-gray-50 border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-gray-100">
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3 font-semibold">Farm size</th>
                  <th className="px-4 py-3 font-semibold">Annual cost</th>
                  <th className="px-4 py-3 font-semibold">Per acre / yr</th>
                </tr>
              </thead>
              <tbody>
                {sizeExamples.map((row) => (
                  <tr key={row.acres} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-semibold text-primary">{row.acres.toLocaleString()} ac</td>
                    <td className="px-4 py-3 text-gray-700">${PRICING.annual.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-700">{row.perAcre}</td>
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
            <Faq q="Is it really one price for any size farm?">
              Yes. Whether you run 300 acres or 6,000, it&apos;s ${PRICING.monthly}/month (or
              ${PRICING.annual.toLocaleString()}/year). No counting acres, no tier upgrades, no surprises
              on the invoice.
            </Faq>
            <Faq q="What's the free trial?">
              {PRICING.trialDays} days of full access — draw your whole operation, print your section
              maps, log your records. No card required to start. Subscribe when you&apos;re ready to keep going.
            </Faq>
            <Faq q="Monthly or annual?">
              Monthly is ${PRICING.monthly}. Annual is ${PRICING.annual.toLocaleString()} — about two
              months free. Switch either way anytime from the billing portal.
            </Faq>
            <Faq q="Can I cancel anytime?">
              Yes. Cancel from <code className="bg-gray-100 px-1 rounded text-sm">/app/billing</code> any
              time — no retention call, no dark patterns. Your data stays accessible after cancellation and
              exports (Shapefile, GeoJSON, KML, PDF) are always available.
            </Faq>
            <Faq q="Do you sell or aggregate my data?">
              No. {SITE_NAME} never sells, shares, or aggregates grower data with traders, brokers, input
              suppliers, or anyone else. Your tonnage, varieties, and block maps are yours.
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
