'use client'

import { useEffect } from 'react'

// Fires the browser print dialog automatically when the print page mounts.
// Wrapped in a small delay so images (Mapbox static map) have time to load.
export default function AutoPrint() {
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        window.print()
      } catch {
        /* ignore */
      }
    }, 700)
    return () => clearTimeout(id)
  }, [])
  return null
}
