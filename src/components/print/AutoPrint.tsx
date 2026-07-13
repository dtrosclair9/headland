'use client'

import { useEffect } from 'react'
import { markPrinted } from './print-state'

// Fires the print dialog once the inline SVG has had a moment to lay out.
// Marks the page as having printed so the Print button knows a re-print
// needs a fresh page (Safari blank-repeat-print bug, webkit.org/b/63408).
export default function AutoPrint() {
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        markPrinted()
        window.print()
      } catch {
        /* ignore */
      }
    }, 400)
    return () => clearTimeout(id)
  }, [])
  return null
}
