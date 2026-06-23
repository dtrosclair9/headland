import type { Metadata } from 'next'
import { BASE_URL, SITE_NAME } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Contact',
  description: `Get in touch with ${SITE_NAME}. We respond within one business day to growers, mills, and partners.`,
  alternates: { canonical: `${BASE_URL}/contact` },
}

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xvzlwjek'

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>
}) {
  const { sent } = await searchParams

  return (
    <>
      <section className="bg-primary-dark text-white">
        <div className="container-wide py-16 md:py-20 max-w-3xl">
          <p className="section-label text-accent">Contact</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold leading-tight">
            Want to talk about cane?
          </h1>
          <p className="mt-5 text-lg text-gray-200 leading-relaxed">
            Real grower questions, mill or co-op channel inquiries, partnership ideas, or
            &quot;this thing should work differently for me&quot; — all welcome. We read every
            email and reply within a business day.
          </p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-wide max-w-2xl">
          {sent === '1' && (
            <div role="status" aria-live="polite" className="mb-6 rounded-md bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-800">
              <strong>Thanks — message sent.</strong> We&apos;ll reply within a business day.
            </div>
          )}

          <form
            action={FORMSPREE_ENDPOINT}
            method="POST"
            className="bg-white border border-gray-100 rounded-xl p-6 space-y-5"
          >
            {/* Formspree config: subject line on the inbound email + redirect target after submit. */}
            <input type="hidden" name="_subject" value={`${SITE_NAME} contact form`} />
            <input type="hidden" name="_next" value={`${BASE_URL}/contact?sent=1`} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="name">Your name</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  maxLength={100}
                  className="input"
                  placeholder="Joe Boudreaux"
                />
              </div>
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="input"
                  placeholder="you@farm.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="farm_name">Farm name (optional)</label>
                <input
                  id="farm_name"
                  name="farm_name"
                  type="text"
                  maxLength={100}
                  className="input"
                  placeholder="Boudreaux Farms"
                />
              </div>
              <div>
                <label className="label" htmlFor="state">State</label>
                <select id="state" name="state" required className="input" defaultValue="">
                  <option value="" disabled>Pick one</option>
                  <option value="Louisiana">Louisiana</option>
                  <option value="Florida">Florida</option>
                  <option value="Other">Other / not yet a grower</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="acres">Roughly how many acres? (optional)</label>
              <input
                id="acres"
                name="acres"
                type="text"
                maxLength={50}
                className="input"
                placeholder="e.g. 2,000"
              />
            </div>

            <div>
              <label className="label" htmlFor="message">What&apos;s on your mind?</label>
              <textarea
                id="message"
                name="message"
                rows={5}
                required
                maxLength={4000}
                className="input"
                placeholder="What are you trying to do, and what's getting in the way?"
              />
            </div>

            <button type="submit" className="btn-primary">
              Send message
            </button>
          </form>
        </div>
      </section>
    </>
  )
}
