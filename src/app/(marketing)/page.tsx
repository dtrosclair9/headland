import Link from 'next/link'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site'

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
    title: 'Records that travel',
    body: 'Harvests, sprays, fertilizer — logged per field, year after year. Export tonnage history when the broker calls.',
  },
  {
    title: 'Scout from the truck',
    body: 'Drop a pin from your phone, snap a photo of the washout or weed patch, send it back to the office instantly.',
  },
  {
    title: 'See vigor with NDVI',
    body: 'Sentinel-2 satellite health imagery refreshed every few days. Spot stressed corners before the helicopter does.',
  },
  {
    title: 'Built for the cane belt',
    body: 'Louisiana parishes, Florida counties. Acres or arpents. Variety lists from LSU AgCenter and USDA Canal Point.',
  },
]

export default function HomePage() {
  return (
    <>
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
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/signup" className="btn-accent">Start free — 5 fields</Link>
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

      {/* CTA */}
      <section className="bg-primary section-padding">
        <div className="container-wide text-center text-white">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to map your fields?</h2>
          <p className="text-gray-200 max-w-xl mx-auto mb-8">
            Free for the first 5 fields. No credit card. Built by growers, for growers — from the Louisiana bayou to the Florida Glades.
          </p>
          <Link href="/signup" className="btn-accent">Start free</Link>
        </div>
      </section>
    </>
  )
}
