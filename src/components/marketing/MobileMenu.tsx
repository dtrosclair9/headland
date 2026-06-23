'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'

const LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]

// Mobile nav. The marketing header uses `backdrop-blur`, which creates a
// containing block that would collapse a `position: fixed` child to height 0
// (the recurring Strykora bug). So the overlay is portaled to <body>, OUTSIDE
// the blurred header, where `fixed` behaves normally.
export default function MobileMenu() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Lock body scroll + close on Escape while the menu is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="md:hidden p-2 -mr-2 text-primary rounded"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-primary-dark/60"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <nav
              aria-label="Mobile"
              className="absolute right-0 top-0 h-full w-72 max-w-[85%] bg-white shadow-xl p-6 flex flex-col"
            >
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="self-end p-2 -mr-2 text-primary rounded"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <div className="mt-4 flex flex-col">
                {LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="py-3 text-lg font-medium text-primary border-b border-gray-100"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
              <div className="mt-6 flex flex-col gap-3">
                <Link href="/login" onClick={() => setOpen(false)} className="btn-ghost justify-center border border-gray-200">
                  Log in
                </Link>
                <Link href="/signup" onClick={() => setOpen(false)} className="btn-accent justify-center">
                  Start free
                </Link>
              </div>
            </nav>
          </div>,
          document.body,
        )}
    </>
  )
}
