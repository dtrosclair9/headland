import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  BASE_URL,
  SITE_NAME,
  SUGARCANE_REGIONS,
  type Region,
} from '@/lib/site'

export function generateStaticParams() {
  return SUGARCANE_REGIONS.map((r) => ({ slug: r.slug }))
}

function getRegion(slug: string): Region | null {
  return SUGARCANE_REGIONS.find((r) => r.slug === slug) ?? null
}

function neighbors(region: Region): Region[] {
  return SUGARCANE_REGIONS.filter(
    (r) => r.stateAbbr === region.stateAbbr && r.slug !== region.slug,
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const region = getRegion(slug)
  if (!region) return {}
  const title = `Sugarcane Field Mapping in ${region.name}, ${region.state}`
  const description = `Field mapping & records built for ${region.name} sugarcane growers. Map every acre, track every ratoon, scout from the truck, print one sheet per field for the crew. Built for ${region.state} — ${region.stateAbbr === 'LA' ? 'Ho/HoCP/L' : 'CP'} varieties, ${region.stateAbbr === 'LA' ? 'arpents' : 'acres'} support.`
  const canonical = `${BASE_URL}/services/sugarcane-field-mapping-${region.slug}`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
    },
  }
}

export default async function RegionLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const region = getRegion(slug)
  if (!region) notFound()

  const isLA = region.stateAbbr === 'LA'
  const otherRegions = neighbors(region)

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `Sugarcane Field Mapping in ${region.name}`,
    serviceType: 'Sugarcane field mapping and records SaaS',
    provider: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: BASE_URL,
    },
    areaServed: {
      '@type': 'AdministrativeArea',
      name: `${region.name}, ${region.state}`,
    },
    url: `${BASE_URL}/services/sugarcane-field-mapping-${region.slug}`,
    description: `Sugarcane-specific field mapping, records keeping, and one-click crew printouts for growers in ${region.name}, ${region.state}.`,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <section className="bg-primary-dark text-white">
        <div className="container-wide py-20 md:py-28">
          <p className="section-label text-accent">{region.state} · {region.kind === 'parish' ? 'Parish' : 'County'}</p>
          <h1 className="mt-3 text-4xl md:text-5xl lg:text-6xl font-bold leading-tight max-w-3xl">
            Sugarcane Field Mapping in {region.name}, {region.state}
          </h1>
          <p className="mt-6 text-lg md:text-xl text-gray-200 max-w-2xl leading-relaxed">
            {SITE_NAME} is field mapping & records built for {region.name} cane farms.
            Draw your fields on satellite, track every ratoon, log every spray, and print
            a sheet per field for the crew — without buying another desktop license.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-accent">Start free trial</Link>
            <Link href="/#features" className="btn-outline">See features</Link>
          </div>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-wide max-w-3xl">
          <h2 className="text-3xl font-bold text-primary mb-4">
            Built for the way {region.state} grows cane
          </h2>
          <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed space-y-4">
            <p>
              {region.name} growers around <strong>{region.mainTown}</strong> share the
              same daily realities: aging desktop software, FSA acreage reports that
              swallow a weekend, and a crew that needs printed field sheets — not an iPad
              app that won&apos;t open in the truck. {SITE_NAME} maps to that workflow.
            </p>
            <p>
              Every farm picks {isLA ? <><strong>arpents</strong> or acres</> : <strong>acres</strong>} as the default unit. Your variety
              dropdown only shows {isLA ? 'Ho, HoCP, HoL, and L releases out of LSU AgCenter and USDA-ARS Houma' : 'CP and CPCL releases out of USDA-ARS Canal Point'} — none of the other state&apos;s
              breeding lines clogging up your records. Operations cover the things you actually do:{' '}
              {isLA
                ? 'stubble shave, sub-soiling, layby, plus the standard sprays and ripener applications.'
                : 'pre-harvest burn (with permit and wind notes), green harvest, sub-soiling, plus the standard sprays.'}
            </p>
          </div>
        </div>
      </section>

      <section className="section-padding bg-gray-50">
        <div className="container-wide max-w-5xl">
          <h2 className="text-3xl font-bold text-primary mb-10 text-center">
            What you get
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Feature title="Draw fields on satellite" body="Trace your blocks right on the satellite map and the acreage is figured for you, down to the tenth. No guesswork, no calculator." />
            <Feature title="Print one sheet per field" body="One click → PDF with the field map, variety, plant date, current cut, recent operations, and a notes box. Hand it to whoever needs to look at a field." />
            <Feature title="Color-coded by cycle" body="Plant cane is bright green, fifth stubble is red. See at a glance which fields are nearing plow-out. No more spreadsheet juggling to remember which field is on what cut." />
            <Feature title="Track every cut" body="Plant cane through fifth stubble, with the variety lineage right there. Ratoon cycle defaults match your state's practice." />
            <Feature title="Records that travel" body="Harvests by year, applications by date — accessible from any device, with an FSA acreage export and printable crop maps on demand." />
          </div>
        </div>
      </section>

      {otherRegions.length > 0 && (
        <section className="section-padding bg-white">
          <div className="container-wide max-w-3xl">
            <h2 className="text-2xl font-bold text-primary mb-4">
              Service area in {region.state}
            </h2>
            <p className="text-gray-700 mb-6">
              {SITE_NAME} works the same way across every {region.state} cane{' '}
              {region.kind === 'parish' ? 'parish' : 'county'}, including:
            </p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {otherRegions.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/services/sugarcane-field-mapping-${r.slug}`}
                    className="block px-3 py-2 rounded-md border border-gray-100 hover:border-accent text-sm text-primary"
                  >
                    {r.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="bg-primary section-padding">
        <div className="container-wide text-center text-white max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to map your {region.kind === 'parish' ? 'parish' : 'county'}&apos;s fields?
          </h2>
          <p className="text-gray-200 mb-8">
            Free for 14 days, no card to start. Built by a Louisianian for the
            cane belt — start mapping in two minutes.
          </p>
          <Link href="/signup" className="btn-accent">Start free trial</Link>
        </div>
      </section>
    </>
  )
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <article className="bg-white border border-gray-100 rounded-lg p-5 hover:border-accent hover:shadow-sm transition">
      <h3 className="text-primary font-bold mb-2">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
    </article>
  )
}
