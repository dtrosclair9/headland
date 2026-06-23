import Link from 'next/link'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site'
import JsonLd from '@/components/JsonLd'
import {
  organizationSchema,
  websiteSchema,
  softwareApplicationSchema,
  faqPageSchema,
} from '@/lib/schema'

const features = [
  {
    title: 'Map every acre',
    body: 'Draw field boundaries on satellite. Auto-calculate acreage on save — pick acres or arpents per farm.',
  },
  {
    title: 'Track every ratoon',
    body: 'Tag each field with variety (HoCP, L-series, CP-series), plant date, and current cut. Plant cane through last stubble — visible at a glance.',
  },
  {
    title: 'Harvest history that lasts',
    body: 'Log tonnage and harvest dates per field, season after season. Your whole history in one place — not a binder in the shop.',
  },
  {
    title: 'Log every spray',
    body: 'Record each spray with product, rate, and the wind direction and speed at the time — per field, ready whenever you need to show it.',
  },
  {
    title: 'Print maps for the crew',
    body: 'Print a clean crop map — blocks colored by cut, no satellite clutter. Hand the crew exactly what to run, plantation by plantation.',
  },
  {
    title: 'Scout from the truck',
    body: 'Drop a pin from your phone, snap a photo of the washout or weed patch, send it back to the office instantly.',
  },
  {
    title: 'Bring your old records over',
    body: 'Export a shapefile from your old desktop program and we load your fields for you, free. The day that old PC finally dies, you’re already moved.',
  },
  {
    title: 'Built for the cane belt',
    body: 'Louisiana parishes, Florida counties. Acres or arpents. Variety lists that match what your state actually plants.',
  },
]

// Homepage FAQs — plain answers a grower (or an AI assistant) can quote.
const faqs = [
  {
    q: 'What is Headland?',
    a: 'Headland is field mapping and recordkeeping built only for sugarcane. Draw your blocks on a satellite map, track variety and cut on each one, log harvests and sprays, and print a clean field sheet for the crew — all in one place you can open from the truck.',
  },
  {
    q: 'How much does it cost?',
    a: 'Fifty cents an acre per year. A 1,000-acre farm is $500 a year; 4,000 acres is $2,000. No setup fee, your crew’s printed sheets are included, and there’s a 14-day free trial with no card.',
  },
  {
    q: 'Is it really just for sugarcane?',
    a: 'Yes. Headland only does cane, in Louisiana and Florida. The variety lists, the ratoon cuts, the field operations — all of it is built around how cane is actually grown, not bent to fit from a corn-and-soybean tool.',
  },
  {
    q: 'Can I move my fields over from my old program?',
    a: 'Yes, and we do it for you, free. If your old desktop software can export a shapefile or KML, send it over and we load your fields so nothing has to be retyped.',
  },
  {
    q: 'Does every worker need a login?',
    a: 'No. You run the records; your crew works off printed sheets, and those are free and unlimited. You pay per acre, not per person.',
  },
  {
    q: 'Will it work on my phone out in the field?',
    a: 'Yes. Drop a pin on a wet hole or a weed patch, snap a photo, and it shows up on the map back at the office. Nothing to install.',
  },
  {
    q: 'Can I get my acreage out for FSA?',
    a: 'Yes. Export your fields as a shapefile and print clean maps whenever you need them — for the FSA office, a buyer, or an inspector.',
  },
  {
    q: 'Who builds Headland?',
    a: 'A third-generation Assumption Parish cane family and the son-in-law who builds the software. No investors and no call center — when you email, you reach the people who farm with it and the person who builds it.',
  },
]

export default function HomePage() {
  return (
    <>
      <JsonLd
        data={[
          organizationSchema(),
          websiteSchema(),
          softwareApplicationSchema(),
          faqPageSchema(faqs),
        ]}
      />

      {/* Hero */}
      <section className="relative bg-primary-dark text-white overflow-hidden">
        <div className="absolute inset-0 opacity-20"
             style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, #2A5A45 0%, transparent 50%), radial-gradient(circle at 80% 70%, #E8A33D 0%, transparent 50%)' }} />
        <div className="relative container-wide py-24 md:py-32">
          <p className="section-label text-accent">For US Sugarcane Growers · Louisiana &amp; Florida</p>
          <h1 className="mt-4 text-4xl md:text-6xl font-bold leading-tight max-w-3xl">
            {SITE_TAGLINE}.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-gray-200 max-w-2xl leading-relaxed">
            Map every acre. Track every ratoon. Scout from the truck.
            Export for FSA in one click. From plant cane to last stubble — {SITE_NAME} keeps every field on one map.
          </p>
          <p className="mt-4 text-base text-gray-300 max-w-2xl">
            Simple enough for anyone on the crew — no training, no manual, no middleman.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/signup" className="btn-accent">Start free trial</Link>
            <Link href="/#features" className="btn-outline">See features</Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="section-padding bg-white">
        <div className="container-wide">
          <div className="max-w-2xl">
            <p className="section-label">What you get</p>
            <h2 className="mt-2 text-3xl md:text-4xl font-bold text-primary">
              Every field, every cut, on one map.
            </h2>
          </div>
          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f) => (
              <article key={f.title} className="border border-gray-100 rounded-lg p-6 hover:border-accent hover:shadow-md transition-all">
                <h3 className="text-primary font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-padding bg-gray-50">
        <div className="container-wide max-w-3xl">
          <div className="mb-10">
            <p className="section-label">Questions</p>
            <h2 className="mt-2 text-3xl md:text-4xl font-bold text-primary">Straight answers</h2>
          </div>
          <div className="space-y-4">
            {faqs.map((f) => (
              <details key={f.q} className="group border-b border-gray-200 pb-4">
                <summary className="font-semibold text-primary cursor-pointer list-none flex justify-between items-center gap-4">
                  {f.q}
                  <span className="text-accent-text text-xl leading-none transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-gray-600 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary section-padding">
        <div className="container-wide text-center text-white">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to map your fields?</h2>
          <p className="text-gray-200 max-w-xl mx-auto mb-8">
            Free for 14 days, no card to start. Built by a cane family, for cane farmers — from the Louisiana bayou to the Florida Glades.
          </p>
          <Link href="/signup" className="btn-accent">Start free trial</Link>
        </div>
      </section>
    </>
  )
}
