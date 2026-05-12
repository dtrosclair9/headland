import Image from 'next/image'
import Link from 'next/link'
import { SITE_NAME } from '@/lib/site'
import { requireUserAndOrg } from '@/lib/orgs'
import { signOut } from '../(auth)/actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, org } = await requireUserAndOrg()

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="container-wide h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/app/map" className="flex items-center gap-2" aria-label={SITE_NAME}>
              <Image
                src="/images/logo-icon.png"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8"
                priority
              />
              <span className="font-serif text-xl font-bold text-primary uppercase tracking-wide">{SITE_NAME}</span>
            </Link>
            <nav className="hidden md:flex gap-6 text-sm font-medium text-gray-700">
              <Link href="/app/map" className="hover:text-primary">Map</Link>
              <Link href="/app/export" className="hover:text-primary">Export</Link>
              <Link href="/app/billing" className="hover:text-primary">Billing</Link>
              <Link href="/app/settings" className="hover:text-primary">Settings</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-sm font-semibold text-primary">{org.name}</span>
              <span className="text-xs text-gray-500">{user.email}</span>
            </div>
            <form action={signOut}>
              <button type="submit" className="btn-ghost text-sm">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col min-h-0">{children}</main>
    </div>
  )
}
