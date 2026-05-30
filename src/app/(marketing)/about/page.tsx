import type { Metadata } from 'next'
import Link from 'next/link'
import { BASE_URL, SITE_NAME } from '@/lib/site'

export const metadata: Metadata = {
  title: 'About',
  description: `${SITE_NAME} is a sugarcane mapping, field-operations & spraying platform built by a third-generation Louisiana cane family and the son-in-law who builds it. Simple enough for any farmer — no training, no middleman.`,
  alternates: { canonical: `${BASE_URL}/about` },
}

export default function AboutPage() {
  return (
    <>
      <section className="bg-primary-dark text-white">
        <div className="container-wide py-16 md:py-20 max-w-3xl">
          <p className="section-label text-accent">About</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold leading-tight">
            Built by a farm family. Not a software company.
          </h1>
          <p className="mt-5 text-lg text-gray-200 leading-relaxed">
            {SITE_NAME} is run by a third-generation Louisiana cane family in{' '}
            <strong>Assumption Parish</strong> and the son-in-law who builds it.
            Between us we cover the two halves that usually never talk to each
            other: how cane actually gets grown, and how to make software that gets
            out of the way.
          </p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-wide max-w-3xl prose prose-gray text-gray-700 leading-relaxed space-y-5">
          <h2 className="text-2xl font-bold text-primary">Why we built it</h2>
          <p>
            The programs farmers were handed are either dead or dying — Windows
            desktop tools from the 2000s that barely run on a modern machine, no
            support, no updates. When the hard drive goes, ten years of records go
            with it.
          </p>
          <p>
            The newer stuff went the other way: bloated, overcomplicated, and
            stuffed with &quot;AI&quot; features and buzzwords that sound great in a
            demo and do nothing for you in the field. Most of them need a consultant
            or an onboarding call before you can even start.
          </p>
          <p>
            We wanted the opposite — the simplest, most effective way to handle the
            three things that actually matter:{' '}
            <strong className="text-primary">
              mapping your ground, tracking field operations, and managing spraying.
            </strong>{' '}
            No middleman teaching you the software. No manual. If you can use a
            phone, you can use {SITE_NAME} — no tech skills required.
          </p>

          <h2 className="text-2xl font-bold text-primary">Who&apos;s behind it</h2>
          <p>
            {SITE_NAME} is a small family operation — no investors, no sales team,
            no call center.
          </p>
          <ul className="list-none pl-0 space-y-3 my-4">
            <li>
              <strong className="text-primary">The Boudreaux family</strong> — three
              generations of cane growers in Assumption Parish. Every feature gets
              ground-truthed against how they actually work their fields. If it would
              feel wrong to them, it doesn&apos;t ship.
            </li>
            <li>
              <strong className="text-primary">Dayne Trosclair</strong> — son-in-law.
              Builds and runs the whole platform: design, software, and support.
              (Also runs Strykora; {SITE_NAME} is its second product line.)
            </li>
          </ul>
          <p>
            That&apos;s it. When you email us, you&apos;re talking to the people who
            farm with it and the person who builds it.
          </p>
        </div>
      </section>

      <section className="bg-primary section-padding">
        <div className="container-wide text-center text-white max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Map your first field in minutes.</h2>
          <p className="text-gray-200 mb-8">
            Free for 14 days, no card required. Built for the way you actually grow cane.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/signup" className="btn-accent">Start free trial</Link>
            <Link href="/contact" className="btn-outline">Talk to us</Link>
          </div>
        </div>
      </section>
    </>
  )
}
