import type { Metadata } from 'next'
import Link from 'next/link'
import { BASE_URL, SITE_NAME } from '@/lib/site'

export const metadata: Metadata = {
  title: 'About',
  description: `${SITE_NAME} is a sugarcane field mapping & records platform inspired by a third-generation Louisiana cane farmer. Built for LA + FL growers by a team that covers domain, business, and engineering.`,
  alternates: { canonical: `${BASE_URL}/about` },
}

export default function AboutPage() {
  return (
    <>
      <section className="bg-primary-dark text-white">
        <div className="container-wide py-16 md:py-20 max-w-3xl">
          <p className="section-label text-accent">About</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold leading-tight">
            Built with a third-generation cane farmer.
          </h1>
          <p className="mt-5 text-lg text-gray-200 leading-relaxed">
            {SITE_NAME} was inspired by a third-generation Louisiana cane farmer in{' '}
            <strong>Assumption Parish</strong> — still actively running fields his
            father and grandfather worked before him. The tools he had to manage them
            with hadn&apos;t kept up.
          </p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-wide max-w-3xl prose prose-gray text-gray-700 leading-relaxed space-y-5">
          <h2 className="text-2xl font-bold text-primary">Why this exists</h2>
          <p>
            US sugarcane in 2026 is concentrated in two places: South Louisiana and the
            Florida Glades. That&apos;s roughly 850 farms managing ~937,000 acres
            between them. It&apos;s a small market, but the per-acre revenue is high
            and the existing software is genuinely bad. Most growers are running
            Windows desktop tools from the 2000s on hardware older than their newest
            variety.
          </p>
          <p>
            {SITE_NAME} fixes the obvious things first: cloud backup so a dead
            hard drive doesn&apos;t cost you ten years of records, satellite mapping
            that matches what you actually see on your land, one-click PDFs you can
            hand to whoever needs to look at a field, and a variety dropdown that only
            shows the breeding lines from your state.
          </p>

          <h2 className="text-2xl font-bold text-primary">The team</h2>
          <p>
            {SITE_NAME} is a marriage of strengths — built so there are no gaps
            between what cane farms need and what the software does:
          </p>
          <ul className="list-none pl-0 space-y-3 my-4">
            <li>
              <strong className="text-primary">The Boudreaux family</strong> — three
              generations of South Louisiana cane growers in Assumption Parish. Every
              {' '}{SITE_NAME} feature gets ground-truthed against how they actually
              work their fields. If something would feel wrong to them, it doesn&apos;t
              ship.
            </li>
            <li>
              <strong className="text-primary">Dayne Trosclair</strong> — runs Strykora,
              a marketing agency that builds websites and tools for South Louisiana
              businesses. {SITE_NAME} is its second product line. Owns design,
              marketing, and the customer-facing side of the platform.
            </li>
            <li>
              <strong className="text-primary">Devin Robichaux</strong> — software
              developer. Owns the engineering side end-to-end so there&apos;s no gap
              between &quot;what the farm needs&quot; and &quot;what the software does.&quot;
            </li>
          </ul>
          <p>
            Domain, business, engineering — covered. If you&apos;re a grower in
            Louisiana or Florida and want to talk about what would actually move the
            needle for you, reach out. We&apos;d rather build for one real farmer than
            a hundred personas.
          </p>
        </div>
      </section>

      <section className="bg-primary section-padding">
        <div className="container-wide text-center text-white max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Map your fields free.</h2>
          <p className="text-gray-200 mb-8">
            Five fields, 100 acres, no card. Built for the way you grow cane.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/signup" className="btn-accent">Start free</Link>
            <Link href="/contact" className="btn-outline">Talk to us</Link>
          </div>
        </div>
      </section>
    </>
  )
}
