import Link from 'next/link'
import { SITE_NAME, SUGARCANE_REGIONS } from '@/lib/site'

export default function MarketingFooter() {
  const louisiana = SUGARCANE_REGIONS.filter((r) => r.stateAbbr === 'LA')
  const florida = SUGARCANE_REGIONS.filter((r) => r.stateAbbr === 'FL')

  return (
    <footer className="bg-primary-dark text-gray-300">
      <div className="container-wide py-16 grid grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-10">
        <div className="col-span-2">
          <p className="font-serif text-2xl text-white font-bold uppercase tracking-wide">{SITE_NAME}</p>
          <p className="mt-3 text-sm leading-relaxed">
            Field mapping &amp; records built for sugarcane growers across the US cane belt.
          </p>
        </div>
        <div>
          <p className="text-white font-semibold mb-3">Product</p>
          <ul className="space-y-2 text-sm">
            <li><Link href="/#features" className="hover:text-accent">Features</Link></li>
            <li><Link href="/pricing" className="hover:text-accent">Pricing</Link></li>
            <li><Link href="/login" className="hover:text-accent">Log in</Link></li>
            <li><Link href="/signup" className="hover:text-accent">Start free</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-white font-semibold mb-3">Louisiana</p>
          <ul className="space-y-2 text-sm">
            {louisiana.map((r) => (
              <li key={r.slug}>
                <Link href={`/services/sugarcane-field-mapping-${r.slug}`} className="hover:text-accent">
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-white font-semibold mb-3">Florida</p>
          <ul className="space-y-2 text-sm">
            {florida.map((r) => (
              <li key={r.slug}>
                <Link href={`/services/sugarcane-field-mapping-${r.slug}`} className="hover:text-accent">
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-primary py-6">
        <div className="container-wide text-xs text-gray-400 flex flex-wrap gap-4 justify-between">
          <span>© {new Date().getFullYear()} {SITE_NAME}. Built by a Louisianian, for the cane belt.</span>
          <span className="flex gap-4">
            <Link href="/about" className="hover:text-accent">About</Link>
            <Link href="/privacy" className="hover:text-accent">Privacy</Link>
            <Link href="/terms" className="hover:text-accent">Terms</Link>
            <span>A Strykora product.</span>
          </span>
        </div>
      </div>
    </footer>
  )
}
