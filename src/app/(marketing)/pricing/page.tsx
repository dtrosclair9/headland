import type { Metadata } from 'next'
import Link from 'next/link'
import { BASE_URL, SITE_NAME } from '@/lib/site'
import { PRICING, annualPrice, monthlyPrice, formatUSD } from '@/lib/billing'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Fifty cents an acre, per year. One price covers your whole operation, with free printed field sheets for your entire crew. No setup fee. 14-day free trial, no card to start.',
  alternates: { canonical: `${BASE_URL}/pricing` },
}

const features = [
  'Every acre you farm — one price',
  'Free printed field sheets for your whole crew',
  'Crop-stage map + printable plantation sheets',
  'Harvest, operation & spray records (with wind)',
  'FSA acreage export (shapefile)',
  'Sentinel-2 NDVI + latest imagery',
  'Free migration from your old software',
  'No setup fee — ever',
]

// Flat 50¢/acre — the table just shows the dollar figure at a few sizes.
const sizeExamples = [400, 1000, 2000, 4000, 8000].map((acres) => ({
  acres,
  annual: annualPrice(acres),
  monthly: monthlyPrice(acres),
}))

export default function PricingPage() {
  return (
    <>
      <section className="bg-primary-dark text-white">
        <div className="container-wide py-16 md:py-20 text-center max-w-3xl mx-auto">
          <p className="section-label text-accent">Pricing</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold">
            Fifty cents an acre. Your whole operation.
          </h1>
          <p className="mt-4 text-lg text-gray-200">
            One simple price covers every acre you farm — and you can print as many field
            sheets for your crew as you want, free. No setup fee, no surprises.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary/40 border border-primary-light/40 px-4 py-2 text-sm text-gray-100">
            <span className="font-semibold">{PRICING.trialDays}-day free trial.</span>
            <span>Full access, no card to start.</span>
            <Link href="/signup" className="ml-2 font-semibold underline hover:text-accent">
              Sign up →
            </Link>
          </div>
        </div>
      </section>

      {/* The headline price */}
      <section className="section-padding bg-gray-50">
        <div className="container-wide max-w-3xl text-center">
          <div className="inline-flex items-end justify-center gap-1">
            <span className="text-6xl font-bold text-primary">$0.50</span>
            <span className="text-gray-500 text-lg mb-2">/ acre / year</span>
          </div>
          <p className="mt-4 text-gray-600 max-w-xl mx-auto">
            That&apos;s the whole bill — every acre, mapped and recorded, with unlimited
            printed sheets for your crew. Pay annually and get{' '}
            <span className="font-semibold text-primary">two months free</span> versus
            paying month-to-month.
          </p>

          <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-gray-700 text-left max-w-xl mx-auto">
            {features.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="text-accent-dark">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-block font-semibold py-2.5 px-6 rounded-md bg-accent text-primary-dark hover:bg-accent-dark transition"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </section>

      {/* Worked examples */}
      <section className="section-padding bg-white">
        <div className="container-wide max-w-3xl">
          <h2 className="text-2xl font-bold text-primary mb-2">
            What it costs for a farm your size
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Always fifty cents an acre — a fraction of what you spend on a single acre of
            inputs. No tiers to read, no math to do.
          </p>
          <div className="bg-gray-50 border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-gray-100">
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3 font-semibold">Farm size</th>
                  <th className="px-4 py-3 font-semibold">Per year</th>
                  <th className="px-4 py-3 font-semibold">Per month</th>
                </tr>
              </thead>
              <tbody>
                {sizeExamples.map((row) => (
                  <tr key={row.acres} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-semibold text-primary">
                      {row.acres.toLocaleString()} ac
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatUSD(row.annual)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatUSD(row.monthly)}</td>
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
            <Faq q="How does the pricing work?">
              Fifty cents per acre, per year, on the acreage you farm. That one price covers
              your whole operation — every block mapped, every record kept. A 1,000-acre farm
              is $500 a year; 4,000 acres is $2,000.
            </Faq>
            <Faq q="What about my crew?">
              Print as many field sheets as you need for your hands — no per-person charge,
              ever. Your crew works off the printed sheet; you run the records. Need a second
              person with their own full login (a partner or your records hand)? Just reach
              out and we&apos;ll add it — most operations never need to.
            </Faq>
            <Faq q="Is there a setup fee?">
              No. Some farm software charges thousands of dollars just to get set up and your
              maps loaded. {SITE_NAME} has no setup fee, and we migrate your old records for
              free.
            </Faq>
            <Faq q="What's the free trial?">
              {PRICING.trialDays} days of full access — draw your whole operation, print your
              plantation sheets, log your records. No card required to start. Subscribe when
              you&apos;re ready to keep going.
            </Faq>
            <Faq q="Monthly or annual?">
              Either. Pay annually and you get two months free versus paying month to month.
              Switch either way anytime from the billing portal.
            </Faq>
            <Faq q="What if my acreage changes?">
              Your bill tracks the acres you farm. Add or drop ground and we&apos;ll true it
              up — you never pay for acres you no longer work.
            </Faq>
            <Faq q="Can I cancel anytime?">
              Yes. Cancel from{' '}
              <code className="bg-gray-100 px-1 rounded text-sm">/app/billing</code> any time —
              no retention call, no dark patterns. Your data stays accessible after
              cancellation, and your FSA acreage export and printable crop maps are always
              available.
            </Faq>
            <Faq q="Do you sell or aggregate my data?">
              No. {SITE_NAME} never sells, shares, or aggregates grower data with traders,
              brokers, input suppliers, or anyone else. Your tonnage, varieties, and block maps
              are yours.
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
