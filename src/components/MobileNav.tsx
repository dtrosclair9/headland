'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const LINKS: [string, string][] = [
  ['/app/map', 'Map'],
  ['/app/sections', 'Sections'],
  ['/app/import', 'Import'],
  ['/app/export', 'Export'],
  ['/app/billing', 'Billing'],
  ['/app/settings', 'Settings'],
]

// Phone-only nav: the desktop link row is hidden below md, so without this a
// phone user can only reach the Map. Hamburger toggles a dropdown of the pages.
export default function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close the menu whenever the route changes (after a link tap).
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className="-ml-1 rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-primary"
      >
        {open ? (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>

      {open && (
        <>
          {/* Tap-away backdrop below the header bar. */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-14 z-40 bg-black/20"
          />
          <nav className="fixed left-0 right-0 top-14 z-50 bg-white border-b border-gray-200 shadow-lg flex flex-col py-2">
            {LINKS.map(([href, label]) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`px-5 py-3 text-base font-medium ${
                    active ? 'text-primary bg-primary/5' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </Link>
              )
            })}
          </nav>
        </>
      )}
    </div>
  )
}
