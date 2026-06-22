'use client'

import { useEffect } from 'react'

// Fires the print dialog once the inline SVG has had a moment to lay out.
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
