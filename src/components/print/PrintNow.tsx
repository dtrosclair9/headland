'use client'

import { useEffect } from 'react'
import { hasPrinted, markPrinted, requestPrintOnLoad, shouldPrintOnLoad } from './print-state'

// Print button on every print page. First print of a page-load calls
// window.print() directly; any print AFTER a dialog was already shown goes
// through a reload — Safari renders a blank preview on repeat prints of the
// same document (webkit.org/b/63408), so each print gets a fresh page.
// Pages that auto-print on load (autoPrintsOnLoad) print themselves after
// the reload; others honor the print-on-load flag here.
export default function PrintNow({ autoPrintsOnLoad = false }: { autoPrintsOnLoad?: boolean }) {
  useEffect(() => {
    if (shouldPrintOnLoad() && !autoPrintsOnLoad) {
      const t = setTimeout(() => {
        markPrinted()
        try {
          window.print()
        } catch {
          /* ignore */
        }
      }, 400)
      return () => clearTimeout(t)
    }
  }, [autoPrintsOnLoad])

  function onClick() {
    if (hasPrinted()) {
      requestPrintOnLoad()
      window.location.reload()
      return
    }
    markPrinted()
    window.print()
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 12,
        fontWeight: 700,
        padding: '3px 12px',
        borderRadius: 999,
        border: 0,
        background: 'white',
        color: '#1A3D2E',
        cursor: 'pointer',
        marginLeft: 14,
      }}
    >
      Print / Save PDF
    </button>
  )
}
