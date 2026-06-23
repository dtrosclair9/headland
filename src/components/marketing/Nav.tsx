import Image from 'next/image'
import Link from 'next/link'
import { SITE_NAME } from '@/lib/site'
import MobileMenu from './MobileMenu'

export default function MarketingNav() {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-100">
      <div className="container-wide flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/images/logo-icon.png"
            alt=""
            width={44}
            height={44}
            className="h-11 w-11"
            priority
          />
          <span className="font-serif text-2xl font-bold text-primary uppercase tracking-wide">{SITE_NAME}</span>
        </Link>
        <nav aria-label="Main" className="hidden lg:flex items-center gap-8 text-sm font-medium text-gray-700">
          <Link href="/#features" className="hover:text-primary">Features</Link>
          <Link href="/pricing" className="hover:text-primary">Pricing</Link>
          <Link href="/about" className="hover:text-primary">About</Link>
          <Link href="/contact" className="hover:text-primary">Contact</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden lg:inline-flex btn-ghost text-sm">Log in</Link>
          <Link href="/signup" className="btn-accent text-sm !px-4 !py-2">Start free</Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  )
}
