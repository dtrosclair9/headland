'use client'

import { useEffect } from 'react'

// Fires the print dialog when the section map mounts. Short delay lets the
// inline SVG lay out first. The user can re-print from the browser anytime.
export default function AutoPrint() {
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        window.print()
      } catch {
        /* ignore */
      }
    }, 400)
    return () => clearTimeout(id)
  }, [])
  return null
}
