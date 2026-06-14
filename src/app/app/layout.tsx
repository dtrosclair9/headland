import Image from 'next/image'
import Link from 'next/link'
import { SITE_NAME } from '@/lib/site'
import { requireUserAndOrg } from '@/lib/orgs'
import { hasActiveSubscription, isCompAccount, isInTrial, trialDaysLeft } from '@/lib/billing'
import { signOut } from '../(auth)/actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, org } = await requireUserAndOrg()
  const comped = isCompAccount(org)
  const subscribed = hasActiveSubscription(org)
  const onTrial = isInTrial(org)
  const daysLeft = trialDaysLeft(org)

  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="container-wide h-14 flex items-center justify-between">
          <div className="flex items-center gap-4 lg:gap-8 min-w-0">
            <Link href="/app/map" className="flex items-center gap-2 shrink-0" aria-label={SITE_NAME}>
              <Image
                src="/images/logo-icon.png"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8"
                priority
              />
              <span className="font-serif text-lg lg:text-xl font-bold text-primary uppercase tracking-wide">{SITE_NAME}</span>
            </Link>
            <nav className="hidden md:flex gap-4 lg:gap-6 text-sm font-medium text-gray-700">
              <Link href="/app/map" className="hover:text-primary">Map</Link>
              <Link href="/app/sections" className="hover:text-primary">Sections</Link>
              <Link href="/app/import" className="hover:text-primary">Import</Link>
              <Link href="/app/export" className="hover:text-primary">Export</Link>
              <Link href="/app/billing" className="hover:text-primary">Billing</Link>
              <Link href="/app/settings" className="hover:text-primary">Settings</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex flex-col items-end leading-tight max-w-[40vw] lg:max-w-none">
              <span className="text-sm font-semibold text-primary truncate max-w-full">{org.name}</span>
              {/* Email widens this column and overflows the bar at tablet width — show it on desktop only. */}
              <span className="hidden lg:block text-xs text-gray-500">{user.email}</span>
            </div>
            <form action={signOut}>
              <button type="submit" className="btn-ghost text-sm">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      {!comped && !subscribed && (
        <Link
          href="/app/billing"
          className={`block text-center text-sm px-4 py-2 font-medium ${
            onTrial
              ? 'bg-accent/20 text-primary-dark hover:bg-accent/30'
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {onTrial
            ? `Free trial — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left. Subscribe →`
            : 'Your free trial has ended. Subscribe to keep going →'}
        </Link>
      )}
      <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
    </div>
  )
}
